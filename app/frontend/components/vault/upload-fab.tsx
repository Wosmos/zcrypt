"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { Upload } from "lucide-react";

export function UploadFAB({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFiles(Array.from(files));
      e.target.value = "";
    }
  };

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => inputRef.current?.click()}
      className="md:hidden fixed right-4 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-[var(--color-accent)] text-white shadow-lg shadow-emerald-500/25"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      aria-label="Upload files"
    >
      <Upload className="h-6 w-6" />
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </motion.button>
  );
}
