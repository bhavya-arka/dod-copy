import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { getToastBgColor } from "./utils";

interface ToastProps {
  message: string;
  type: string;
  onDismiss: () => void;
}

/**
 * Toast notification component with auto-dismiss
 */
export default function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor = getToastBgColor(type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className={`${bgColor} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 min-w-[300px]`}
    >
      <Info className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm flex-1">{message}</span>
      <button onClick={onDismiss} className="hover:opacity-80">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
