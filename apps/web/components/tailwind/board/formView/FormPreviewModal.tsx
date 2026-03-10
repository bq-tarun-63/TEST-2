"use client";

import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useAuth } from "@/hooks/use-auth";
import useAddRootPage from "@/hooks/use-addRootPage";
import type { BoardProperty } from "@/types/board";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, X, Link, Edit2Icon } from "lucide-react";
import { FORM_PROPERTY_TYPES } from "./FormAddPropertyDialog";
import FormQuestionCard from "./FormQuestionCard";
import EditIcon from "@/components/tailwind/ui/icons/editIcon";
import Image from "next/image";
import SubmissionStatus from "./SubmissionStatus";
import { Block } from "@/types/block";
import { ObjectId } from "bson";
import { postWithAuth } from "@/lib/api-helpers";

interface FormPreviewModalProps {
  readonly board: Block;
  readonly onClose: () => void;
  readonly isPageMode?: boolean; // If true, renders as a page without modal overlay and actions
}

export default function FormPreviewModal({ board, onClose, isPageMode = false }: FormPreviewModalProps) {
  const { addRootPage } = useAddRootPage();
  const { currentView, getCurrentDataSourceProperties, getNotesByDataSourceId, updateDataSource, dataSources } = useBoard();
  const { getBlock, addBlock } = useGlobalBlocks();
  const { user } = useAuth();
  const { currentWorkspace, workspaceMembers } = useWorkspaceContext();
  const [formResponses, setFormResponses] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<"idle" | "success" | "error">("idle");
  const [submissionMessage, setSubmissionMessage] = useState("");

  const currentViewData = currentView[board._id];
  const latestBoard = getBlock(board._id) || board;

  // Get current view with form icon and cover
  const currentViewWithMetadata = useMemo(() => {
    const viewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;

    let view;
    if (viewData?.id) {
      const currentViewId = viewData.id;
      view = latestBoard.value?.viewsTypes?.find((vt) => vt._id === currentViewId);
    } else if (viewData?.type) {
      view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === viewData.type);
    }

    return view;
  }, [currentView, board._id, getBlock]);

  const formIcon = currentViewWithMetadata?.formIcon || "";
  const formCoverImage = currentViewWithMetadata?.formCoverImage || null;
  const formTitle = currentViewWithMetadata?.formTitle || "Form title";
  const formDescription = currentViewWithMetadata?.formDescription || "";

  const getCurrentDataSourceId = (): string | null => {
    let view;
    if (currentViewData?.id) {
      const currentViewId = currentViewData.id;
      view = latestBoard.value?.viewsTypes?.find((vt) => vt._id === currentViewId);
    } else if (currentViewData?.type) {
      view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }
    const dsId = view?.databaseSourceId;
    return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
  };

  const boardProperties = useMemo(() => {
    return getCurrentDataSourceProperties(board._id);
  }, [board._id, getCurrentDataSourceProperties]);

  // Allowed property types for forms (from FormAddPropertyDialog)
  const allowedFormPropertyTypes = useMemo(() => {
    return new Set<BoardProperty["type"]>(
      FORM_PROPERTY_TYPES.map((type) => type.propertyType as BoardProperty["type"])
    );
  }, []);

  const formQuestions = useMemo(() => {
    return Object.entries(boardProperties)
      .filter(([, property]) => {
        if (
          currentViewWithMetadata?.isPublicForm === "public" &&
          property.type === "person"
        ) {
          return false;
        }
        return allowedFormPropertyTypes.has(property.type);
      })
      .map(([propertyId, property]) => ({
        propertyId,
        property,
        isRequired: property.formMetaData?.isFiedRequired || false,
        description: property.formMetaData?.Description || "",
      }));
  }, [
    boardProperties,
    allowedFormPropertyTypes,
    currentViewWithMetadata?.isPublicForm,
  ]);

  const handleInputChange = (propertyId: string, value: any) => {
    setFormResponses((prev) => ({
      ...prev,
      [propertyId]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmissionStatus("idle");
    setSubmissionMessage("");

    const missingFields = formQuestions
      .filter((q) => q.isRequired && !formResponses[q.propertyId])
      .map((q) => q.property.name);

    if (missingFields.length > 0) {
      const message = `Please fill in required fields: ${missingFields.join(", ")}`;
      toast.error(message);
      setSubmissionStatus("error");
      setSubmissionMessage(message);
      return;
    }

    const dataSourceId = getCurrentDataSourceId();
    if (!dataSourceId) {
      toast.error("No data source found");
      return;
    }

    setIsSubmitting(true);
    try {
      const databaseProperties: Record<string, any> = {};
      Object.entries(formResponses).forEach(([propertyId, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          databaseProperties[propertyId] = value;
        }
      });

      const title =
        currentViewWithMetadata?.formAnonymousResponses
          ? "New Submission"
          : user?.name?.trim()
            ? user.name.trim()
            : "New Submission";

      // Generate new block ID
      const newPageId = new ObjectId().toString();

      // Create Block object
      const newBlock: Block = {
        _id: newPageId,
        blockType: "page",
        value: {
          title: title,
          pageType: "Viewdatabase_Note",
          databaseProperties: databaseProperties,
          icon: "",
          coverUrl: null,
          userId: user?.email || "",
          userEmail: user?.email || "",
        },
        workareaId: null,
        parentId: dataSourceId,
        parentType: "collection",
        workspaceId: currentWorkspace?._id || "",
        status: "alive",
        blockIds: [],
      };

      addBlock(newBlock);

      //  Update datasource in board context with new page block ID
      const currentDataSource = dataSources[dataSourceId];
      let originalDataSourceBlockIds: string[] = [];
      if (currentDataSource) {
        originalDataSourceBlockIds = currentDataSource.blockIds || [];
        updateDataSource(dataSourceId, {
          blockIds: [...originalDataSourceBlockIds, newPageId]
        });
      }

      await postWithAuth("/api/note/block/batch-create", {
        view_databaseId: board._id,
        parentId: dataSourceId,
        workspaceId: board.workspaceId,
        parentTable: "collection", // Datasource is a block
        blocks: [
          {
            _id: newPageId,
            blockType: "page",
            value: newBlock.value,
            insertAfterBlockID: null,
          },
        ],
      });

      const successMessage = "Your response was submitted successfully.";
      toast.success(successMessage);
      setFormResponses({});
      if (isPageMode) {
        setSubmissionStatus("success");
        setSubmissionMessage(successMessage);
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Failed to submit form:", error);
      const failureMessage = "Server error submitting the response. Please try again.";
      toast.error(failureMessage);
      setSubmissionStatus("error");
      setSubmissionMessage(failureMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmission = () => {
    setSubmissionStatus("idle");
    setSubmissionMessage("");
    setFormResponses({});
  };

  if (isPageMode) {
    if (submissionStatus === "success" && submissionMessage) {
      return (
        <SubmissionStatus
          status={submissionStatus}
          message={submissionMessage}
          isPageMode={true}
          onReset={handleResetSubmission}
        />
      );
    }

    return (
      <div className="min-h-screen bg-background">
        <div className="w-full max-w-4xl mx-auto">
          {/* Cover Image with overlapping icon */}
          <div className="relative w-full">
            {formCoverImage && (
              <div className="relative w-full h-[30vh] max-h-[280px] flex-shrink-0">
                <img
                  src={formCoverImage}
                  alt="Form cover"
                  className="w-full h-full object-cover m-0"
                  style={{ objectPosition: "center 50%" }}
                />
              </div>
            )}

            {/* Icon positioned to overlap cover image (half over cover) or with proper spacing when no cover */}
            {formIcon && (
              <div className={`absolute left-20 ${formCoverImage ? "-bottom-10" : "top-16"}`}>
                <div className="text-6xl leading-none">{formIcon}</div>
              </div>
            )}
          </div>

          {/* Add top padding when no cover to create space above title */}
          <div
            className={`px-20 ${formCoverImage
                ? formIcon
                  ? "pt-16"
                  : "pt-12"
                : formIcon
                  ? "pt-[170px]"
                  : "pt-20"
              } pb-20`}
          >
            <div className="mb-6 px-3">
              {/* Title below icon */}
              <div>
                <h1 className="text-4xl font-bold text-foreground leading-tight">{formTitle}</h1>
                {formDescription && (
                  <p className="mt-2 text-base text-muted-foreground whitespace-pre-wrap">
                    {formDescription}
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  {currentViewWithMetadata?.formAnonymousResponses ? (
                    <span className="flex items-center gap-2">Submitting responses anonymously</span>
                  ) : (
                    <>
                      <span className="flex items-center gap-2">Submitting responses as</span>
                      <div className="flex items-center gap-2">
                        <div className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-transparent group-hover:border-gray-300 dark:group-hover:border-[rgb(42,42,42)] transition-colors">
                          {user?.image && (
                            <Image
                              src={user.image}
                              alt="Profile"
                              fill
                              className="object-cover m-0"
                            />
                          )}
                        </div>
                        <span className="font-medium text-muted-foreground">{user?.name}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <SubmissionStatus status={submissionStatus} message={submissionMessage} />
              {formQuestions.map((question) => (
                <FormQuestionCard
                  key={question.propertyId}
                  propertyId={question.propertyId}
                  property={question.property}
                  value={formResponses[question.propertyId]}
                  onChange={(value) => handleInputChange(question.propertyId, value)}
                  onUpdate={() => { }}
                  onDelete={() => { }}
                  onDuplicate={() => { }}
                  disableResponseInput={false}
                  showActionsMenu={false}
                  editable={false}
                  cardClassName="bg-background"
                  availableMembers={workspaceMembers || []}
                />
              ))}

              {formQuestions.length > 0 && (
                <div className="flex justify-start pt-2 px-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/75" onClick={onClose} aria-hidden="true" />
      <div className="relative z-[510] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
        <div className=" absolute right-2 top-2 z-[511] bg-background rounded-md p-1.5 py-0.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted transition"
              aria-label="Edit Form"
            >
              <EditIcon className="w-4 h-4 text-gray-600" />
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted transition"
              aria-label="Copy link"
            >
              <Link className="h-3.5 w-3.5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Cover Image with overlapping icon */}
        <div className="relative w-full">
          {formCoverImage && (
            <div className="relative w-full h-[30vh] max-h-[280px] flex-shrink-0">
              <img
                src={formCoverImage}
                alt="Form cover"
                className="w-full h-full object-cover m-0"
                style={{ objectPosition: "center 50%" }}
              />
            </div>
          )}

          {/* Icon positioned to overlap cover image (half over cover) or with proper spacing when no cover */}
          {formIcon && (
            <div className={`absolute left-20 ${formCoverImage ? '-bottom-10' : 'top-16'}`}>
              <div className="text-6xl leading-none">
                {formIcon}
              </div>
            </div>
          )}
        </div>

        {/* Add top padding when no cover to create space above title */}
        <div className={`px-20 ${formCoverImage ? (formIcon ? 'pt-16' : 'pt-12') : (formIcon ? 'pt-[170px]' : 'pt-20')} pb-20`}>
          <div className="mb-6 px-3">
            {/* Title below icon */}
            <div>
              <h1 className="text-4xl font-bold text-foreground leading-tight">
                {formTitle}
              </h1>
              {formDescription && (
                <p className="mt-2 text-base text-muted-foreground whitespace-pre-wrap">
                  {formDescription}
                </p>
              )}
            </div>

            <div className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                {currentViewWithMetadata?.formAnonymousResponses ? (
                  <span className="flex items-center gap-2">Submitting responses anonymously</span>
                ) : (
                  <>
                    <span className="flex items-center gap-2">
                      Submitting responses as
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-transparent group-hover:border-gray-300 dark:group-hover:border-[rgb(42,42,42)] transition-colors">
                        {user?.image && (
                          <Image
                            src={user.image}
                            alt="Profile"
                            fill
                            className="object-cover m-0"
                          />
                        )}
                      </div>
                      <span className="font-medium text-muted-foreground">{user?.name}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <SubmissionStatus status={submissionStatus} message={submissionMessage} />
            {formQuestions.map((question) => (
              <FormQuestionCard
                key={question.propertyId}
                propertyId={question.propertyId}
                property={question.property}
                value={formResponses[question.propertyId]}
                onChange={(value) => handleInputChange(question.propertyId, value)}
                onUpdate={() => { }}
                onDelete={() => { }}
                onDuplicate={() => { }}
                disableResponseInput={false}
                showActionsMenu={false}
                editable={false}
                cardClassName=" bg-background"
                availableMembers={workspaceMembers || []}
              />
            ))}

            {formQuestions.length > 0 && (
              <div className="flex justify-start pt-2 px-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

