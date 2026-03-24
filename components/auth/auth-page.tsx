"use client"
import Image from "next/image"
import LoginForm from "./login-form"

export default function AuthPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <Image
              src="https://www.opencoders.icu/oc.png"
              alt="Ezzy Cart Logo"
              width={120}
              height={120}
              className="h-24 w-auto"
              priority
            />
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-medium text-blue-400">Powered by Ezzy Cart</p>
          </div>
          <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-white">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-gray-800 px-6 py-8 shadow-xl sm:rounded-xl sm:px-8 border border-gray-700">
            <LoginForm />
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Ezzy Cart. All rights reserved.</p>
      </footer>
    </div>
  )
}
