import { ComponentProps } from "react";
import { Newspaper } from "lucide-react";

export function ProfileActivityFeed() {
    return (
        <div className="flex flex-col gap-6 flex-grow max-w-[780px] w-full md:w-[560px] self-start">
            <div>
                <div className="text-sm leading-5 text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis pb-2 font-normal">
                    Recent activity
                </div>
                <div>
                    <div className="min-h-[220px] flex text-center items-center justify-center text-sm color-gray-500 flex-col flex-1">
                        <div className="flex flex-col items-center justify-center h-full gap-2.5 pt-5">
                            <Newspaper className="w-8 h-8 block fill-gray-300 flex-shrink-0 text-gray-300 dark:fill-gray-600 dark:text-gray-600" />
                            <div className="flex flex-col items-center justify-center gap-0.5">
                                <div className="text-sm leading-5 font-medium text-gray-900 dark:text-gray-100">
                                    No activity yet
                                </div>
                                <div className="flex flex-col items-center justify-center gap-3 max-w-[300px]">
                                    <div className="text-gray-500 dark:text-gray-400 text-sm leading-5 font-normal">
                                        Start collaborating with this user by creating your first document together
                                    </div>
                                    {/* Action Button Mockup - functionality can be added later */}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="select-none transition-colors cursor-pointer inline-flex items-center justify-center h-7 px-2 rounded-md whitespace-nowrap text-sm font-medium leading-tight border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 w-fit hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        <div className="text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis">
                                            Create a shared document
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <section role="feed"></section>
                    <div></div>
                </div>
            </div>
        </div>
    );
}
