import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#f5f5f5] text-[#171717] shadow hover:bg-[#e5e5e5]", // hardcoded light bg/text
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-700", // hardcoded
        outline:
          "border border-gray-300 bg-[#f5f5f5] text-[#171717] shadow-sm hover:bg-[#e5e5e5]", // hardcoded
        secondary:
          "bg-[#ededed] text-[#171717] shadow-sm hover:bg-[#e5e5e5]", // hardcoded
        ghost: "bg-transparent text-[#171717] hover:bg-[#f5f5f5]", // hardcoded
        link: "text-blue-700 underline-offset-4 hover:underline bg-transparent", // hardcoded
        doge: "bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900 font-bold shadow-lg hover:from-yellow-500 hover:to-yellow-700", // already hardcoded
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants } 