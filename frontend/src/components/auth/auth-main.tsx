import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import CommonButton from "../common/common-button";
import CommonInput from "../common/common-input";
import useAPICaller from "../common/hooks/useCallApi";
import { loginRequest, signUpRequest, type LoginResponse, type SignUpBody, type SignUpResponse } from "../../api/auth";
import { tokenStorage } from "../../lib/tokenStorage";

export default function AuthMain() {
    const navigate = useNavigate();
    const [signUp, setSignUp] = useState(false);
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const loginApi = useAPICaller<LoginResponse, URLSearchParams>();
    const signUpApi = useAPICaller<SignUpResponse, SignUpBody>();
    const loading = loginApi.loading || signUpApi.loading;
    const shownError = errorMessage ?? (signUp ? signUpApi.error : loginApi.error);

    const toggleAuth = () => {
        setSignUp((prev) => !prev);
        setErrorMessage(null);
        setSuccessMessage(null);
        loginApi.reset();
        signUpApi.reset();
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (signUp) {
            // On failure the hook's `error` is shown
            const res = await signUpApi.callApi(signUpRequest({ username, email, password }));
            if (res?.data) {
                // Account created: switch to login with the same details filled in
                setSuccessMessage(res.message);
                setSignUp(false);
            }
            return;
        }

        // Backend login matches the email (or username); OAuth2 form field is still named `username`
        const res = await loginApi.callApi(loginRequest(email, password));
        const tokens = res?.data;
        if (tokens?.access_token) {
            tokenStorage.setAccessToken(tokens.access_token);
            navigate("/main");
        } else if (res) {
            // 200 response without tokens
            setErrorMessage("Login failed");
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
            <form
                className="flex w-[400px] min-h-[400px] flex-col items-center justify-center gap-5 rounded-[20px] border-2 border-line px-6 py-8"
                onSubmit={handleSubmit}
            >
                <div>
                    <span className="text-xl font-bold text-ink">
                        {signUp ? "Create Account" : "Login"}
                    </span>
                </div>

                <div className="flex w-full flex-col gap-3 text-sm font-semibold text-ink">

                    <CommonInput
                        placeholder="Enter email..."
                        type="email"
                        label="Email:"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    {signUp && (
                        <CommonInput
                            placeholder="Enter username..."
                            type="text"
                            label="Username:"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    )}

                    <CommonInput
                        placeholder="Enter password..."
                        type="password"
                        label="Password:"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                </div>

                {shownError && <p className="w-full text-xs text-red-600">{shownError}</p>}
                {successMessage && <p className="w-full text-xs text-ready-text">{successMessage}</p>}

                <CommonButton
                    label={signUp ? "Sign Up" : "Sign In"}
                    type="submit"
                    disabled={loading}
                    className="h-[40px] w-[150px]"
                />

                <button
                    type="button"
                    onClick={toggleAuth}
                    className="text-sm text-ink transition-colors duration-200 hover:text-brand"
                >
                    {signUp
                        ? "Already have an account? "
                        : "Don't have an account? "}

                    <span className="text-brand">
                        {signUp ? "Sign In" : "Sign Up"}
                    </span>
                </button>
            </form>
        </div>
    );
}