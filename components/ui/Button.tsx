import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon,
  className = '',
  ...props 
}) => {
  const baseStyles = "font-mono transition-all duration-200 flex items-center justify-center gap-2 border disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-nd-white text-nd-black border-nd-white hover:bg-transparent hover:text-nd-white",
    secondary: "bg-transparent text-nd-white border-nd-gray hover:border-nd-white",
    danger: "bg-nd-red text-white border-nd-red hover:bg-transparent hover:text-nd-red",
    ghost: "bg-transparent text-nd-gray border-transparent hover:text-nd-white hover:bg-nd-gray/20"
  };

  const sizes = {
    sm: "px-3 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
};