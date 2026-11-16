import { Suspense } from "react"
import ResetPassword from "@modules/account/components/reset-password"

export default function ResetPasswordPage() {
  return (
    <div className="flex justify-center px-4 py-12">
      <Suspense>
        <ResetPassword />
      </Suspense>
    </div>
  )
}
