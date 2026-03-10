"use client";

import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useBlockTypeRegistryContext } from "@/hooks/useBlockTypeRegistry";
import { useState } from "react";

/**
 * Debug panel to test and visualize RootPagesOrderContext and BlockTypeRegistry
 * This is a development-only component to verify Priority 1 implementation
 *
 * Usage: Add this component temporarily to any page to test the contexts
 */
export default function ContextDebugPanel() {
  const rootPagesOrder = useRootPagesOrder();
  const blockTypeRegistry = useBlockTypeRegistryContext();
  const [testPageId, setTestPageId] = useState("");

  const handleAddPrivatePage = () => {
    const id = `page-${Date.now()}`;
    rootPagesOrder.addPrivatePage(id);
    console.log("Added private page:", id);
  };

  const handleAddPublicPage = () => {
    const id = `page-${Date.now()}`;
    rootPagesOrder.addPublicPage(id);
    console.log("Added public page:", id);
  };

  const handleRegisterBlock = () => {
    if (!testPageId) return;
    blockTypeRegistry.registerBlock(testPageId, "page");
    console.log("Registered block:", testPageId, "as page");
  };

  const handleCheckSpecial = () => {
    if (!testPageId) return;
    const isSpecial = blockTypeRegistry.isSpecialBlock(testPageId);
    console.log("Is special block:", testPageId, "->", isSpecial);
    alert(`Block ${testPageId} is ${isSpecial ? "special" : "not special"}`);
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl p-4 max-h-[80vh] overflow-y-auto z-50">
      <h2 className="text-lg font-bold mb-4">Context Debug Panel</h2>

      {/* RootPagesOrderContext */}
      <section className="mb-6">
        <h3 className="font-semibold text-sm mb-2">Root Pages Order</h3>

        <div className="space-y-2 mb-3">
          <button
            onClick={handleAddPrivatePage}
            className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Add Private Page
          </button>
          <button
            onClick={handleAddPublicPage}
            className="w-full px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            Add Public Page
          </button>
        </div>

        <div className="text-xs space-y-2">
          <div>
            <strong>Private ({rootPagesOrder.privatePagesOrder.length}):</strong>
            <div className="mt-1 p-2 bg-zinc-100 dark:bg-zinc-800 rounded max-h-20 overflow-y-auto">
              {rootPagesOrder.privatePagesOrder.length === 0 ? (
                <span className="text-zinc-500">Empty</span>
              ) : (
                rootPagesOrder.privatePagesOrder.map((id) => (
                  <div key={id} className="truncate">{id}</div>
                ))
              )}
            </div>
          </div>

          <div>
            <strong>Public ({rootPagesOrder.publicPagesOrder.length}):</strong>
            <div className="mt-1 p-2 bg-zinc-100 dark:bg-zinc-800 rounded max-h-20 overflow-y-auto">
              {rootPagesOrder.publicPagesOrder.length === 0 ? (
                <span className="text-zinc-500">Empty</span>
              ) : (
                rootPagesOrder.publicPagesOrder.map((id) => (
                  <div key={id} className="truncate">{id}</div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* BlockTypeRegistry */}
      <section>
        <h3 className="font-semibold text-sm mb-2">Block Type Registry</h3>

        <div className="space-y-2 mb-3">
          <input
            type="text"
            value={testPageId}
            onChange={(e) => setTestPageId(e.target.value)}
            placeholder="Enter block ID..."
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded text-sm bg-white dark:bg-zinc-800"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRegisterBlock}
              disabled={!testPageId}
              className="flex-1 px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Register as Page
            </button>
            <button
              onClick={handleCheckSpecial}
              disabled={!testPageId}
              className="flex-1 px-3 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Check Special
            </button>
          </div>
        </div>

        <div className="text-xs">
          <strong>Registered Blocks:</strong>
          <div className="mt-1 p-2 bg-zinc-100 dark:bg-zinc-800 rounded max-h-32 overflow-y-auto">
            {Array.from(blockTypeRegistry.getAllBlocks().entries()).length === 0 ? (
              <span className="text-zinc-500">Empty</span>
            ) : (
              Array.from(blockTypeRegistry.getAllBlocks().entries()).map(([id, type]) => (
                <div key={id} className="flex justify-between gap-2">
                  <span className="truncate flex-1">{id}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{type}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="mt-4 pt-4 border-t border-zinc-300 dark:border-zinc-700 text-xs text-zinc-500">
        Check browser console for detailed logs
      </div>
    </div>
  );
}
