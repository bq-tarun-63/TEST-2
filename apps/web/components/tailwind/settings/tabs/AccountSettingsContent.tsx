"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Copy, Laptop, HelpCircle, ChevronRight, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadCoverImage } from "@/components/tailwind/image-upload";
import EditIcon from "../../ui/icons/editIcon";
import CoverImage, { coverImages } from "../../editor/CoverImage";

export default function AccountSettingsContent() {
    const { user, setUser } = useAuth();
    const [preferredName, setPreferredName] = useState(user?.name || "");
    const [image, setImage] = useState(user?.image || "");
    const [about, setAbout] = useState(user?.about || "");
    const [coverUrl, setCoverUrl] = useState(user?.coverUrl || "");
    const [isUpdating, setIsUpdating] = useState(false);
    const [supportAccess, setSupportAccess] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isImageUploading, setIsImageUploading] = useState(false);
    const [isEditingAbout, setIsEditingAbout] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user?.name) setPreferredName(user.name);
        if (user?.image) setImage(user.image);
        if (user?.about) setAbout(user.about);
        if (user?.coverUrl) setCoverUrl(user.coverUrl);
    }, [user?.name, user?.image, user?.about, user?.coverUrl]);

    const handleUpdateField = async (field: "name" | "image" | "about" | "coverUrl", value: string) => {
        console.log(`Updating ${field} to:`, value);
        if (!user) return;

        // Prevent update if the value is the same as current
        if (user[field as keyof typeof user] === value) return;

        // Snapshot previous user state for rollback
        const previousUser = { ...user };

        // 1. Optimistic Update
        const optimisticUser = { ...user, [field]: value.trim() };
        setUser(optimisticUser);
        localStorage.setItem("auth_user", JSON.stringify(optimisticUser));

        setIsUpdating(true);

        try {
            const response = await fetch(`/api/user/update/${field}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [field]: value.trim() }),
            });

            if (!response.ok) throw new Error(`Failed to update ${field}`);

            // Optional: You can still update with the server response if you want to be 100% sure,
            // but the user asked to "dont wait for response". 
            // The optimistic update is already done.
            // We can just confirm success.
            toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`);

        } catch (error) {
            console.error(error);
            toast.error(`Failed to update ${field}`);

            // Revert local state and storage on error
            setUser(previousUser);
            localStorage.setItem("auth_user", JSON.stringify(previousUser));

            // Also revert the component local state to match
            if (field === "name") setPreferredName(previousUser.name || "");
            if (field === "image") setImage(previousUser.image || "");
            if (field === "about") setAbout(previousUser.about || "");
            if (field === "coverUrl") setCoverUrl(previousUser.coverUrl || "");
        } finally {
            setIsUpdating(false);
        }
    };

    const copyUserId = () => {
        if (!user?.id) return;
        navigator.clipboard.writeText(user.id);
        setCopied(true);
        toast.success("User ID copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImageUploading(true);
        try {
            const url = await uploadCoverImage(file);
            if (url) {
                // Optimistic update
                setImage(url);
                await handleUpdateField("image", url);
            }
        } catch (error) {
            console.error("Image upload failed", error);
            toast.error("Failed to upload image");
        } finally {
            setIsImageUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleRemoveImage = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!image) return;

        const previousImage = image;
        setImage(""); // Optimistic update
        try {
            await handleUpdateField("image", "");
        } catch (error) {
            console.error("Failed to remove image", error);
            setImage(previousImage); // Revert on failure
        }
    };

    const handleRemoveCover = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!coverUrl) return;

        const previousCover = coverUrl;
        setCoverUrl(""); // Optimistic update
        try {
            await handleUpdateField("coverUrl", "");
        } catch (error) {
            console.error("Failed to remove cover", error);
            setCoverUrl(previousCover); // Revert on failure
        }
    };

    const handlePickerClose = () => {
        setShowPicker(false);
    };

    const handleCoverChangeFromPicker = async (url: string) => {
        setCoverUrl(url); // Optimistic
        await handleUpdateField("coverUrl", url);
    };

    const handlePickerUpload = async (file: File) => {
        try {
            const url = await uploadCoverImage(file);
            return url;
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    return (
        <div className="space-y-12">
            {/* Account Section */}
            <div>
                <div className="border-b border-zinc-200 dark:border-zinc-700 mb-4 mt-0 pb-3 text-base font-medium w-auto text-zinc-900 dark:text-zinc-100">
                    Account
                </div>

                <div className="flex flex-col gap-6">
                    <div className="flex flex-row items-center">
                        <div className="relative group">
                            <div
                                onClick={() => !isImageUploading && fileInputRef.current?.click()}
                                title={image ? "Replace image" : "Upload image"}
                                className={cn(
                                    "w-[60px] h-[60px] rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 relative",
                                    !isImageUploading && "cursor-pointer hover:opacity-90 transition-opacity"
                                )}
                            >
                                {isImageUploading ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                                ) : (
                                    <>
                                        {image ? (
                                            <img alt={user?.name || "User"} src={image} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-xl font-medium text-zinc-500">{user?.name?.charAt(0) || "U"}</span>
                                        )}
                                    </>
                                )}
                            </div>

                            {image && !isImageUploading && (
                                <button
                                    onClick={handleRemoveImage}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-white dark:bg-zinc-800 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-500 opacity-0 group-hover:opacity-100 transition-all z-10 shadow-sm"
                                    title="Remove image"
                                    type="button"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}

                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileSelect}
                            />
                        </div>

                        <div className="ml-5 w-[250px]">
                            <label className="block mb-1 text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">
                                Preferred name
                            </label>
                            <div className="flex items-center w-full text-sm relative rounded-md shadow-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                <input
                                    type="text"
                                    value={preferredName}
                                    onChange={(e) => setPreferredName(e.target.value)}
                                    onBlur={() => handleUpdateField("name", preferredName)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    disabled={isUpdating}
                                    className="w-full bg-transparent border-none px-2.5 py-1 focus:outline-none text-zinc-900 dark:text-zinc-100 disabled:opacity-50"
                                    placeholder="Enter your name..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="max-w-[500px] group">
                            <label className="block mb-1 text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">
                                About
                            </label>
                            {!isEditingAbout && about ? (
                                <div className="relative w-full text-sm">
                                    <div className="text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap py-1.5 px-0.5 min-h-[38px]">
                                        {about}
                                    </div>
                                    <button
                                        onClick={() => setIsEditingAbout(true)}
                                        className="absolute -top-1 -right-7 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Edit about"
                                    >
                                        <EditIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center w-full text-sm relative rounded-md shadow-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                    <textarea
                                        value={about}
                                        onChange={(e) => setAbout(e.target.value)}
                                        onFocus={() => setIsEditingAbout(true)}
                                        onBlur={() => {
                                            handleUpdateField("about", about);
                                            if (about.trim()) setIsEditingAbout(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                            }
                                        }}
                                        disabled={isUpdating}
                                        rows={3}
                                        autoFocus={isEditingAbout}
                                        className="w-full bg-transparent border-none px-2.5 py-1.5 focus:outline-none text-zinc-900 dark:text-zinc-100 disabled:opacity-50 resize-none"
                                        placeholder="Tell us about yourself..."
                                    />
                                </div>
                            )}
                        </div>

                        <div className="max-w-[500px]">
                            <label className="block mb-1 text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">
                                Cover Image
                            </label>

                            {!coverUrl && (
                                <div
                                    onClick={() => setShowPicker(true)}
                                    className="w-full h-32 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center relative cursor-pointer hover:opacity-90 transition-opacity"
                                >
                                    <div className="flex flex-col items-center gap-2 text-zinc-500">
                                        <span className="text-sm font-medium">Add cover image</span>
                                    </div>
                                </div>
                            )}

                            <div className="[&>.relative]:!h-32 [&>.relative]:!max-h-32 [&>.relative]:rounded-lg [&>.relative]:overflow-hidden">
                                <CoverImage
                                    coverUrl={coverUrl}
                                    onCoverChange={handleCoverChangeFromPicker}
                                    onCoverRemove={() => handleRemoveCover({ stopPropagation: () => { } } as any)}
                                    onUploadCover={handlePickerUpload}
                                    openPicker={showPicker}
                                    onPickerClose={handlePickerClose}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Account Security Section */}
            <div>
                <div className="border-b border-zinc-200 dark:border-zinc-700 mb-4 mt-0 pb-3 text-base font-medium w-auto text-zinc-900 dark:text-zinc-100">
                    Account security
                </div>

                <div className="flex items-center justify-between cursor-default">
                    <div className="flex flex-col mr-[5%] w-3/4 gap-1.5">
                        <div className="text-zinc-900 dark:text-zinc-100 text-sm leading-5 font-normal">
                            Email
                        </div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-[13px] leading-[18px] font-normal">
                            {user?.email || "No email linked"}
                        </div>
                    </div>
                    <button className="user-select-none transition-colors duration-200 ease-in cursor-pointer inline-flex items-center h-8 px-3 rounded-md whitespace-nowrap text-sm justify-center font-medium leading-[1.2] border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        Manage emails
                    </button>
                </div>
            </div>

            {/* Support Section */}
            <div>
                <div className="border-b border-zinc-200 dark:border-zinc-700 mb-4 mt-0 pb-3 text-base font-medium w-auto text-zinc-900 dark:text-zinc-100">
                    Support
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between py-1">
                        <div className="flex flex-col mr-[5%] w-3/4 gap-1.5">
                            <div className="text-zinc-900 dark:text-zinc-100 text-sm leading-5 font-normal">Support access</div>
                            <div className="text-zinc-600 dark:text-zinc-400 text-[13px] leading-relaxed font-normal">
                                Grant our support team temporary access to your account to help troubleshoot problems or recover content on your behalf. You can revoke access anytime.
                            </div>
                        </div>
                        <div
                            onClick={() => setSupportAccess(!supportAccess)}
                            className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none",
                                supportAccess ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-700"
                            )}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5",
                                    supportAccess ? "translate-x-4.5" : "translate-x-0.5"
                                )}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between cursor-pointer group">
                        <div className="flex flex-col mr-[5%] w-3/4 gap-1.5">
                            <div className="text-red-500 text-sm leading-5 font-normal">Delete my account</div>
                            <div className="text-zinc-600 dark:text-zinc-400 text-[13px] leading-[18px] font-normal">
                                Permanently delete your account. You’ll no longer be able to access your pages or any of the workspaces you belong to.
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                    </div>
                </div>
            </div>

            {/* Devices Section */}
            <div>
                <div className="border-b border-zinc-200 dark:border-zinc-700 mb-4 mt-0 pb-3 text-base font-medium w-auto text-zinc-900 dark:text-zinc-100">
                    <div className="flex items-center gap-1">
                        Devices
                        <HelpCircle className="w-4 h-4 text-zinc-400" />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between cursor-default">
                        <div className="flex flex-col mr-[5%] w-3/4 gap-1.5">
                            <div className="text-zinc-900 dark:text-zinc-100 text-sm leading-5 font-normal">Log out of all devices</div>
                            <div className="text-zinc-600 dark:text-zinc-400 text-[13px] leading-[18px] font-normal">
                                Log out of active sessions on all your devices, other than this one
                            </div>
                        </div>
                        <button className="user-select-none transition-colors duration-200 ease-in cursor-pointer inline-flex items-center h-8 px-3 rounded-md whitespace-nowrap text-sm justify-center font-medium leading-[1.2] border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            Log out
                        </button>
                    </div>

                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="h-9 text-zinc-500 dark:text-zinc-400 font-normal bg-zinc-50 dark:bg-zinc-800/50">
                                    <th className="text-left font-normal px-4 w-[35%]">Device Name</th>
                                    <th className="text-left font-normal px-4 w-[30%]">Last Active</th>
                                    <th className="text-left font-normal px-4 w-[35%]">Location</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                <tr className="h-[52px]">
                                    <td className="px-4">
                                        <div className="flex items-center gap-3">
                                            <Laptop className="w-5 h-5 text-zinc-400" />
                                            <div className="flex flex-col">
                                                <span className="text-zinc-900 dark:text-zinc-100 font-medium">macOS</span>
                                                <span className="text-blue-500 text-[11px]">This Device</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 text-zinc-600 dark:text-zinc-400">Now</td>
                                    <td className="px-4 text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">Indore, MP, India</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="h-9 flex items-center px-4 text-[12px] text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
                            All devices loaded
                        </div>
                    </div>
                </div>
            </div>

            {/* User ID Section */}
            <div>
                <div className="border-b border-zinc-200 dark:border-zinc-700 mb-4 mt-0 pb-3 text-base font-medium w-auto text-zinc-900 dark:text-zinc-100">
                    User ID
                </div>

                <div className="flex items-center justify-between cursor-default">
                    <div className="flex flex-col mr-[5%] w-3/4 gap-1.5">
                        <div className="text-zinc-900 dark:text-zinc-100 text-sm leading-5 font-normal">User ID</div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-[13px] leading-[18px] font-normal font-mono">
                            {user?.id || "---"}
                        </div>
                    </div>
                    <button
                        onClick={copyUserId}
                        className="user-select-none transition-colors duration-200 ease-in cursor-pointer inline-flex items-center h-8 px-3 rounded-md whitespace-nowrap text-sm justify-center font-medium leading-[1.2] border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-500 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        Copy ID
                    </button>
                </div>
            </div>
        </div>
    );
}
