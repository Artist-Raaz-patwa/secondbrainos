import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-xs font-mono text-nd-gray uppercase tracking-wider">{label}</label>}
      <input 
        className={`bg-black border border-nd-gray text-nd-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-nd-red transition-colors placeholder-nd-gray/50 ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-nd-red font-mono">{error}</span>}
    </div>
  );
};