import React, { useState, useRef, useCallback } from "react";
import { X, Loader2, Upload, AlertCircle, AlertTriangle, CheckCircle, FileText, RefreshCw } from "lucide-react";
import { uploadInventoryFile, commitInventoryUpload } from "../../../services/warehouseService";
import type { FileUploadResult, FileCommitResult, ValidationMessage } from "../types";

interface InventoryFileImportModalProps {
  siteId: number;
  siteName: string;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalState = "idle" | "uploading" | "preview" | "committing" | "success";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function InventoryFileImportModal({
  siteId,
  siteName,
  onClose,
  onSuccess,
}: InventoryFileImportModalProps) {
  const [state, setState] = useState<ModalState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<FileUploadResult | null>(null);
  const [commitResult, setCommitResult] = useState<FileCommitResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const validTypes = [".pdf", ".csv"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!validTypes.includes(ext)) {
      return "Only PDF and CSV files are supported";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File size must be less than 10MB";
    }
    return null;
  };

  const handleFileSelect = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    setError(null);
    setState("uploading");

    try {
      const result = await uploadInventoryFile(siteId, file);
      setUploadResult(result);
      setState("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
      setState("idle");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [siteId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleReupload = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setError(null);
    setState("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCommit = async () => {
    if (!uploadResult) return;

    setState("committing");
    setError(null);

    try {
      const result = await commitInventoryUpload(siteId, uploadResult.uploadId);
      setCommitResult(result);
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit upload");
      setState("preview");
    }
  };

  const handleSuccessClose = () => {
    onSuccess();
    onClose();
  };

  const getRowsWithIssues = () => {
    if (!uploadResult) return { errorRows: new Set<number>(), warningRows: new Set<number>() };
    
    const errorRows = new Set<number>();
    const warningRows = new Set<number>();
    
    uploadResult.errors.forEach(msg => {
      if (msg.rowIndex !== undefined) {
        errorRows.add(msg.rowIndex);
      }
    });
    
    uploadResult.warnings.forEach(msg => {
      if (msg.rowIndex !== undefined) {
        warningRows.add(msg.rowIndex);
      }
    });
    
    return { errorRows, warningRows };
  };

  const renderValidationMessages = (messages: ValidationMessage[], type: "error" | "warning") => {
    if (messages.length === 0) return null;
    
    const bgColor = type === "error" ? "bg-red-50" : "bg-amber-50";
    const borderColor = type === "error" ? "border-red-200" : "border-amber-200";
    const textColor = type === "error" ? "text-[#DC2626]" : "text-[#F59E0B]";
    const Icon = type === "error" ? AlertCircle : AlertTriangle;
    
    return (
      <div className={`p-4 rounded-xl ${bgColor} border ${borderColor} mb-4`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-5 h-5 ${textColor}`} />
          <span className={`font-semibold ${textColor}`}>
            {messages.length} {type === "error" ? "Error" : "Warning"}{messages.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="space-y-1 text-sm">
          {messages.slice(0, 10).map((msg, idx) => (
            <li key={idx} className={textColor}>
              <span className="font-medium">[{msg.scope}:{msg.target}]</span> {msg.message}
              {msg.rowIndex !== undefined && <span className="text-xs ml-1">(Row {msg.rowIndex + 1})</span>}
            </li>
          ))}
          {messages.length > 10 && (
            <li className={`${textColor} italic`}>...and {messages.length - 10} more</li>
          )}
        </ul>
      </div>
    );
  };

  const renderIdleState = () => (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        isDragging
          ? "border-[#004E89] bg-[#004E89]/5"
          : "border-border hover:border-[#004E89]/50"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.csv"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
      <p className="text-lg font-medium text-foreground mb-2">
        Upload file or drag here
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Accepts PDF or CSV files (max 10MB)
      </p>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-6 py-2.5 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
      >
        Browse Files
      </button>
    </div>
  );

  const renderUploadingState = () => (
    <div className="flex flex-col items-center py-12">
      <Loader2 className="w-12 h-12 text-[#004E89] animate-spin mb-4" />
      <p className="text-lg font-medium text-foreground mb-2">Processing file...</p>
      <p className="text-sm text-muted-foreground">
        {selectedFile?.name}
      </p>
    </div>
  );

  const renderPreviewState = () => {
    if (!uploadResult) return null;

    const { errorRows, warningRows } = getRowsWithIssues();
    const previewRows = uploadResult.preview.slice(0, 15);
    const columnHeaders = uploadResult.columns;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
          <FileText className="w-5 h-5 text-[#004E89]" />
          <div>
            <p className="font-medium text-foreground">{uploadResult.filename}</p>
            <p className="text-xs text-muted-foreground">
              {uploadResult.totalRows} total rows
            </p>
          </div>
        </div>

        {renderValidationMessages(uploadResult.errors, "error")}
        {renderValidationMessages(uploadResult.warnings, "warning")}

        {uploadResult.errors.length === 0 && uploadResult.warnings.length === 0 && (
          <div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#16A34A]" />
              <span className="font-semibold text-[#16A34A]">
                Validation passed - Ready to import
              </span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-foreground border-b border-border">
                  #
                </th>
                {columnHeaders.map((col, idx) => (
                  <th
                    key={idx}
                    className={`px-3 py-2 text-left font-medium border-b border-border ${
                      col.isRecognized ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <div>{col.originalName}</div>
                    {col.mappedTo && (
                      <div className="text-xs font-normal text-[#004E89]">
                        → {col.mappedTo}
                      </div>
                    )}
                    {!col.isRecognized && (
                      <div className="text-xs font-normal text-amber-600">
                        (unrecognized)
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIdx) => {
                const hasError = errorRows.has(rowIdx);
                const hasWarning = warningRows.has(rowIdx);
                let rowClass = "";
                if (hasError) rowClass = "bg-red-50";
                else if (hasWarning) rowClass = "bg-amber-50";

                return (
                  <tr key={rowIdx} className={`${rowClass} hover:bg-muted/30`}>
                    <td className="px-3 py-2 text-muted-foreground border-b border-border">
                      {rowIdx + 1}
                    </td>
                    {columnHeaders.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className="px-3 py-2 text-foreground border-b border-border max-w-[200px] truncate"
                      >
                        {row[col.originalName] ?? "-"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {uploadResult.totalRows > 15 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing 15 of {uploadResult.totalRows} rows
          </p>
        )}
      </div>
    );
  };

  const renderCommittingState = () => (
    <div className="flex flex-col items-center py-12">
      <Loader2 className="w-12 h-12 text-[#004E89] animate-spin mb-4" />
      <p className="text-lg font-medium text-foreground mb-2">Saving to database...</p>
      <p className="text-sm text-muted-foreground">
        This may take a moment for large files
      </p>
    </div>
  );

  const renderSuccessState = () => {
    if (!commitResult) return null;

    return (
      <div className="flex flex-col items-center py-12">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="w-10 h-10 text-[#16A34A]" />
        </div>
        <p className="text-lg font-medium text-foreground mb-2">Import Complete!</p>
        <div className="text-sm text-muted-foreground text-center space-y-1 mb-6">
          <p>{commitResult.count} items imported successfully</p>
          {commitResult.skippedRows > 0 && (
            <p className="text-amber-600">{commitResult.skippedRows} rows skipped</p>
          )}
        </div>
        <button
          onClick={handleSuccessClose}
          className="px-6 py-2.5 rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
        >
          Done
        </button>
      </div>
    );
  };

  const renderContent = () => {
    switch (state) {
      case "idle":
        return renderIdleState();
      case "uploading":
        return renderUploadingState();
      case "preview":
        return renderPreviewState();
      case "committing":
        return renderCommittingState();
      case "success":
        return renderSuccessState();
    }
  };

  const renderFooter = () => {
    if (state === "idle" || state === "uploading" || state === "success") {
      return null;
    }

    if (state === "committing") {
      return null;
    }

    return (
      <div className="flex gap-3 pt-4 border-t border-border">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleReupload}
          className="flex-1 py-2.5 text-sm rounded-xl border border-border bg-white hover:bg-muted transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Re-upload
        </button>
        <button
          onClick={handleCommit}
          disabled={!uploadResult?.canCommit}
          className="flex-1 py-2.5 text-sm rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Confirm Import
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Import Inventory (PDF/CSV)
            </h2>
            <p className="text-sm text-muted-foreground">
              Importing to: {siteName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#DC2626] text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {renderContent()}
        </div>

        {renderFooter() && (
          <div className="p-6 bg-white border-t-0">
            {renderFooter()}
          </div>
        )}
      </div>
    </div>
  );
}
