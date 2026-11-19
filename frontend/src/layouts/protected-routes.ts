import type React from "react";
import { createElement } from "react";
import { Navigate } from "react-router-dom";
import { tokenStorage } from "../lib/tokenStorage";

export default function ProtectedRoutes({ children }:React.PropsWithChildren){

    // Not logged in: back to the login page
    if (!tokenStorage.isLoggedIn()) {
        return createElement(Navigate, { to: "/", replace: true })
    }

    return(
        children
    )
}
