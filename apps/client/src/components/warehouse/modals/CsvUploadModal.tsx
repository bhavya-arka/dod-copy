import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { uploadInventoryCsv } from "../../../services/warehouseService";

interface CsvUploadModalProps {
  siteId: number;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Modal for uploading CSV inventory data
 */
export default function CsvUploadModal({ siteId, onClose, onSuccess }: CsvUploadModalProps) {
  const [csvContent, setCsvContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      setError("CSV content is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await uploadInventoryCsv(siteId, csvContent);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload CSV");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Import Inventory CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#2563EB] file:text-white hover:file:bg-[#1d4ed8]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Or paste CSV content</label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="requisition_no,description,quantity,length_in,width_in,height_in,weight_lb,unit_price..."
              rows={8}
              className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm font-mono focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
