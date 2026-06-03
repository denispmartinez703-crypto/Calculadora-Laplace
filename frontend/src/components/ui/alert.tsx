import * as React from "react";

import { cn } from "@/lib/utils";


const alertVariants = {
  default: "border-border bg-background text-foreground",
  destructive: "border-destructive/50 text-destructive",
} as const;


type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof alertVariants;
};


const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "relative w-full rounded-lg border px-4 py-3 text-sm",
        alertVariants[variant],
        className,
      )}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";


const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm leading-6", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";


export { Alert, AlertDescription };
