import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export interface TextConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  expectedPhrase: string;
  onConfirm: () => void | Promise<void>;
  isDestructive?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export default function TextConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  expectedPhrase,
  onConfirm,
  isDestructive = false,
  isLoading = false,
  children,
}: TextConfirmationDialogProps) {
  const [inputValue, setInputValue] = useState("");
  
  const isMatch = inputValue.toLowerCase() === expectedPhrase.toLowerCase();
  const isConfirmEnabled = isMatch && !isLoading;

  useEffect(() => {
    if (!open) {
      setInputValue("");
    }
  }, [open]);

  const handleConfirm = async () => {
    if (isConfirmEnabled) {
      await onConfirm();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isConfirmEnabled) {
      handleConfirm();
    }
  };

  const accentColor = isDestructive ? "red" : "blue";
  const IconComponent = isDestructive ? AlertTriangle : CheckCircle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background">
        <DialogHeader>
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              isDestructive ? "bg-red-100" : "bg-blue-100"
            }`}>
              <IconComponent className={`w-5 h-5 ${
                isDestructive ? "text-red-600" : "text-blue-600"
              }`} />
            </div>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          </motion.div>
          <DialogDescription asChild>
            <motion.div 
              className="mt-3 text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              {description}
            </motion.div>
          </DialogDescription>
        </DialogHeader>

        <motion.div 
          className="py-4 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.15 }}
        >
          {children}
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Type{" "}
              <span className={`font-mono px-1.5 py-0.5 rounded ${
                isDestructive 
                  ? "text-red-600 bg-red-50" 
                  : "text-blue-600 bg-blue-50"
              }`}>
                {expectedPhrase}
              </span>{" "}
              to confirm:
            </label>
            <div className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={expectedPhrase}
                className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
                  isDestructive
                    ? "border-border focus:ring-red-500 focus:border-red-500"
                    : "border-border focus:ring-blue-500 focus:border-blue-500"
                }`}
                autoFocus
              />
              <AnimatePresence>
                {isMatch && (
                  <motion.div
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <CheckCircle className={`w-5 h-5 ${
                      isDestructive ? "text-red-500" : "text-green-500"
                    }`} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <DialogFooter className="gap-2 sm:gap-2">
          <motion.button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Cancel
          </motion.button>
          <motion.button
            type="button"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              isDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            whileHover={isConfirmEnabled ? { scale: 1.02 } : {}}
            whileTap={isConfirmEnabled ? { scale: 0.98 } : {}}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </motion.button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
