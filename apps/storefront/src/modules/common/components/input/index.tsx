import { Label, clx, focusRing } from "@modules/common/components/ui"
import React, { useEffect, useImperativeHandle, useState } from "react"

import Eye from "@modules/common/icons/eye"
import EyeOff from "@modules/common/icons/eye-off"

type InputProps = Omit<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
  "placeholder"
> & {
  label: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
  name: string
  passwordToggleLabel?: string
  topLabel?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type,
      name,
      label,
      touched: _touched,
      required,
      topLabel,
      passwordToggleLabel = "Show or hide password",
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const inputId = props.id ?? name.replace(/\./g, "-")
    const [showPassword, setShowPassword] = useState(false)
    const [inputType, setInputType] = useState(type)

    useEffect(() => {
      if (type === "password" && showPassword) {
        setInputType("text")
      }

      if (type === "password" && !showPassword) {
        setInputType("password")
      }
    }, [type, showPassword])

    useImperativeHandle(ref, () => inputRef.current!)

    return (
      <div className="flex flex-col w-full">
        {topLabel && (
          <Label className="mb-2 txt-compact-medium-plus">{topLabel}</Label>
        )}
        <div className="relative z-0 flex w-full">
          <input
            type={inputType}
            name={name}
            placeholder=" "
            required={required}
            className={clx(
              "block h-12 w-full appearance-none rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-4 pb-1 pt-5 text-base text-mtogo-text-primary transition-[border-color,box-shadow] duration-150 hover:border-mtogo-text-secondary focus:border-mtogo-focus-ring focus:outline-none focus:ring-2 focus:ring-mtogo-focus-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              type === "password" && "pr-12",
            )}
            {...props}
            id={inputId}
            ref={inputRef}
          />
          <label
            htmlFor={inputId}
            onClick={() => inputRef.current?.focus()}
            className="pointer-events-none absolute left-4 top-3 origin-top-left text-base leading-6 text-mtogo-text-secondary transition-transform duration-150 ease-out-strong motion-reduce:transition-none"
          >
            {label}
            {required && (
              <span className="text-mtogo-status-error-text">*</span>
            )}
          </label>
          {type === "password" && (
            <button
              type="button"
              aria-label={passwordToggleLabel}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
              className={clx(
                "absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-md text-mtogo-text-secondary transition-colors duration-150 hover:text-mtogo-text-primary",
                focusRing,
              )}
            >
              {showPassword ? <Eye /> : <EyeOff />}
            </button>
          )}
        </div>
      </div>
    )
  },
)

Input.displayName = "Input"

export default Input
