import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";
import { MenuSelect } from "@/shared/ui";
import { EyeLine, EyeCloseLine, ArrowLeftLine } from "@mingcute/react";
import WindowControls from "@/features/navigation/ui/WindowControls";
import LoginBackdrop from "./LoginBackdrop";
import { useWindowState } from "@/features/navigation/hooks/useWindowState";
import { useAuth } from "../hooks/useAuth";
import { useTranslation, LOCALE_OPTIONS } from "@/languages";
import logo from "@/assets/logo.png";
import { HumanCheckNotice } from "@/features/human-check";
import { cn } from "@/shared/lib";
import { useUsernameAvailability } from "../hooks/useUsernameAvailability";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 48px+ logo, monochrome mark, sits at the top of the card. */
function BrandMark() {
  return (
    <img
      src={logo}
      alt="Iris"
      width={52}
      height={52}
      draggable={false}
      className="theme-logo h-[52px] w-auto select-none object-contain"
    />
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { isEdgeToEdge } = useWindowState();
  const { signIn, signUp } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<
    "username" | "displayName" | null
  >(null);
  const usernameStatus = useUsernameAvailability(
    username,
    mode === "register" && registerStep === 2,
  );
  const usernameTaken = usernameStatus === "taken";
  const usernameHasError =
    usernameTaken || (Boolean(error) && errorField !== "displayName");
  const usernameMessageId =
    (error && errorField !== "displayName") || usernameTaken
      ? "auth-form-error"
      : "auth-username-hint";

  const selectMode = (next: "login" | "register") => {
    if (submitting || next === mode) return;
    setMode(next);
    setRegisterStep(1);
    setError("");
    setConfirmPassword("");
  };

  const resolveErrorMessage = (nextError: unknown): string => {
    const message =
      nextError instanceof Error ? nextError.message : String(nextError ?? "");
    const normalized = message.toLowerCase();
    if (/invalid login credentials|invalid credentials/.test(normalized))
      return t("login.errors.invalid_credentials");
    if (
      /already registered|already been registered|user already/.test(normalized)
    )
      return t("login.errors.email_already_used");
    if (/username is already taken/.test(normalized))
      return t("login.errors.username_taken");
    if (/username must be/.test(normalized))
      return t("login.errors.username_invalid");
    if (/password should be at least|weak password/.test(normalized))
      return t("login.errors.password_min_8");
    if (/failed to fetch|network|load failed/.test(normalized))
      return t("login.errors.server_unavailable");
    return message || t("login.errors.server_error");
  };

  const handleStep1Continue = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setError(t("login.errors.email_invalid"));
      return;
    }
    if (password.length < 8) {
      setError(t("login.errors.password_min_8"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("login.errors.password_mismatch"));
      return;
    }
    setError("");

    // Friendly suggestions from the email prefix when the fields are empty.
    if (!username) {
      const autoHandle = normalizedEmail
        .split("@")[0]
        ?.replace(/[^a-z0-9_]/g, "")
        .slice(0, 30);
      if (autoHandle && autoHandle.length >= 3) {
        setUsername(autoHandle);
      }
    }
    if (!displayName) {
      const autoName = normalizedEmail.split("@")[0];
      if (autoName) {
        setDisplayName(autoName);
      }
    }

    setRegisterStep(2);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setErrorField(null);

    if (mode === "login") {
      const normalizedEmail = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalizedEmail)) {
        setError(t("login.errors.email_invalid"));
        return;
      }
      if (password.length < 8) {
        setError(t("login.errors.password_min_8"));
        return;
      }
      setSubmitting(true);
      setError("");
      try {
        await signIn(normalizedEmail, password);
        navigate("/", { replace: true });
      } catch (nextError) {
        setError(resolveErrorMessage(nextError));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (registerStep === 1) {
      handleStep1Continue();
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    if (!USERNAME_RE.test(normalizedUsername)) {
      setErrorField("username");
      setError(t("login.errors.username_invalid"));
      return;
    }
    if (usernameTaken) {
      setErrorField("username");
      setError(t("login.errors.username_taken"));
      return;
    }
    if (!cleanDisplayName) {
      setErrorField("displayName");
      setError(t("login.errors.display_name_required"));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await signUp(
        normalizedEmail,
        password,
        normalizedUsername,
        cleanDisplayName,
      );
      if (result.requiresEmailConfirmation) {
        setMode("login");
        setRegisterStep(1);
        setError("Check your inbox to confirm your email, then sign in.");
        return;
      }
      navigate("/", { replace: true });
    } catch (nextError) {
      const rawMessage =
        nextError instanceof Error
          ? nextError.message
          : String(nextError ?? "");
      const message = resolveErrorMessage(nextError);
      if (/already registered|already been registered/i.test(rawMessage)) {
        setRegisterStep(1);
      } else if (/username/i.test(rawMessage)) {
        setErrorField("username");
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    mode === "login"
      ? t("login.auth_title_login")
      : registerStep === 1
        ? t("login.auth_title_register")
        : t("login.profile_setup_title");
  const subheading =
    mode === "login"
      ? t("login.auth_subtitle_login")
      : registerStep === 1
        ? t("login.auth_subtitle_register")
        : t("login.profile_setup_subtitle");

  const passwordToggle = (
    shown: boolean,
    toggle: () => void,
    label: string,
  ) => (
    <button
      type="button"
      aria-label={label}
      onClick={toggle}
      className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
    >
      {shown ? (
        <EyeCloseLine className="h-4 w-4" />
      ) : (
        <EyeLine className="h-4 w-4" />
      )}
    </button>
  );

  const fieldLabel = "mb-[7px] block text-[12px] font-[500] text-white/55";

  return (
    <main
      className={cn(
        "relative flex h-full w-full justify-center overflow-hidden bg-[#07070B]",
        isEdgeToEdge
          ? "rounded-none border-0"
          : "rounded-item border border-white/10",
      )}
    >
      <LoginBackdrop edgeToEdge={isEdgeToEdge} />

      <WindowControls variant="glass" isFullscreen />

      <div
        className="relative z-10 flex w-full min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingTop: "max(22px, env(safe-area-inset-top))",
          paddingBottom: "max(22px, env(safe-area-inset-bottom))",
          paddingLeft: "max(14px, env(safe-area-inset-left))",
          paddingRight: "max(14px, env(safe-area-inset-right))",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: EASE_OUT }}
          className="m-auto flex w-full max-w-[430px] shrink-0 flex-col gap-[18px]"
        >
          <section
            data-theme="dark"
            className="relative w-full rounded-[26px] border border-white/10 bg-white/[0.045] p-[22px] shadow-[0_30px_90px_-40px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:p-[28px]"
          >
            {/* language switch, top-right of the card */}
            <div className="absolute right-[14px] top-[14px]">
              <MenuSelect
                options={LOCALE_OPTIONS}
                value={locale}
                onChange={setLocale}
                align="end"
                className="min-w-[104px]"
                aria-label={t("login.select_language")}
              />
            </div>

            <div className="flex flex-col items-center gap-[6px] pt-[6px]">
              <BrandMark />
              <h1
                className="m-0 mt-[8px] text-center text-[24px] font-[650] leading-[1.15] tracking-[-0.03em] text-white"
                style={{ textWrap: "balance" }}
              >
                {heading}
              </h1>
              <p
                className="m-0 max-w-[300px] text-center text-[13px] leading-[1.5] text-white/50"
                style={{ textWrap: "pretty" }}
              >
                {subheading}
              </p>
            </div>

            {/* fluid Connexion / Inscription switch */}
            <div
              role="tablist"
              aria-label={t("login.select_mode")}
              className="relative mt-[20px] grid grid-cols-2 gap-[2px] rounded-full border border-white/10 bg-black/40 p-[3px]"
            >
              {(
                [
                  { id: "login", label: t("login.btn_sign_in") },
                  { id: "register", label: t("login.btn_create_account") },
                ] as const
              ).map((item) => {
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectMode(item.id)}
                    className="relative flex h-[36px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[13px] font-[550] outline-none"
                  >
                    {active ? (
                      <motion.div
                        layoutId="auth-mode-pill"
                        className="absolute inset-0 rounded-full bg-white"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-10 transition-colors duration-150",
                        active
                          ? "text-black"
                          : "text-white/55 hover:text-white/85",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <form
              noValidate
              onSubmit={submit}
              className="mt-[18px] flex flex-col"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {mode === "login" || registerStep === 1 ? (
                  <motion.div
                    key="step-credentials"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    className="flex flex-col"
                  >
                    <label className={fieldLabel} htmlFor="auth-email">
                      {t("login.label_email")}
                    </label>
                    <TextInput
                      id="auth-email"
                      autoFocus
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoComplete="email"
                      placeholder={t("login.placeholder_email")}
                      value={email}
                      hasError={Boolean(error)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "auth-form-error" : undefined}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) setError("");
                      }}
                      disabled={submitting}
                    />

                    <label
                      className={cn(fieldLabel, "mt-[14px]")}
                      htmlFor="auth-password"
                    >
                      {t("login.label_password")}
                    </label>
                    <TextInput
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder={
                        mode === "login"
                          ? t("login.placeholder_password")
                          : t("login.placeholder_password_new")
                      }
                      value={password}
                      hasError={Boolean(error)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "auth-form-error" : undefined}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (error) setError("");
                      }}
                      disabled={submitting}
                      rightSlot={passwordToggle(
                        showPassword,
                        () => setShowPassword((v) => !v),
                        showPassword
                          ? t("login.hide_password")
                          : t("login.show_password"),
                      )}
                    />

                    <AnimatePresence initial={false}>
                      {mode === "register" && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: EASE_OUT }}
                          className="overflow-hidden"
                        >
                          <label
                            className={cn(fieldLabel, "mt-[14px]")}
                            htmlFor="auth-confirm"
                          >
                            {t("login.label_confirm_password")}
                          </label>
                          <TextInput
                            id="auth-confirm"
                            type={showConfirmPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder={t("login.placeholder_confirm")}
                            value={confirmPassword}
                            hasError={Boolean(error)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={
                              error ? "auth-form-error" : undefined
                            }
                            onChange={(event) => {
                              setConfirmPassword(event.target.value);
                              if (error) setError("");
                            }}
                            disabled={submitting}
                            rightSlot={passwordToggle(
                              showConfirmPassword,
                              () => setShowConfirmPassword((v) => !v),
                              showConfirmPassword
                                ? t("login.hide_password")
                                : t("login.show_password"),
                            )}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <motion.div
                    key="step-profile"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    className="flex flex-col"
                  >
                    <label className={fieldLabel} htmlFor="auth-username">
                      {t("login.label_username")}
                    </label>
                    <TextInput
                      id="auth-username"
                      autoFocus
                      type="text"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoComplete="username"
                      placeholder={t("login.placeholder_username")}
                      value={username}
                      icon={
                        <span className="select-none text-[14px] font-medium text-white/40">
                          @
                        </span>
                      }
                      hasError={usernameHasError}
                      aria-invalid={usernameHasError}
                      aria-describedby={usernameMessageId}
                      onChange={(event) => {
                        setUsername(
                          event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, ""),
                        );
                        if (error) setError("");
                      }}
                      disabled={submitting}
                    />
                    {(error && errorField === "username") || usernameTaken ? (
                      <span
                        id="auth-form-error"
                        role="alert"
                        className="mt-1 text-[11px] font-[500] text-[#ff5c72]"
                      >
                        {error && errorField === "username"
                          ? error
                          : t("login.errors.username_taken")}
                      </span>
                    ) : (
                      <span
                        id="auth-username-hint"
                        aria-live="polite"
                        className={cn(
                          "mt-1 text-[11px]",
                          usernameStatus === "available"
                            ? "text-emerald-400"
                            : "text-white/40",
                        )}
                      >
                        {usernameStatus === "checking"
                          ? t("login.username_checking")
                          : usernameStatus === "available"
                            ? t("login.username_available")
                            : t("login.username_hint")}
                      </span>
                    )}

                    <label
                      className={cn(fieldLabel, "mt-[14px]")}
                      htmlFor="auth-display-name"
                    >
                      {t("login.label_display_name")}
                    </label>
                    <TextInput
                      id="auth-display-name"
                      type="text"
                      autoComplete="name"
                      placeholder={t("login.placeholder_display_name")}
                      value={displayName}
                      hasError={Boolean(error) && errorField !== "username"}
                      aria-invalid={Boolean(error) && errorField !== "username"}
                      aria-describedby={error ? "auth-form-error" : undefined}
                      onChange={(event) => {
                        setDisplayName(event.target.value);
                        if (error) setError("");
                      }}
                      disabled={submitting}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="min-h-[20px] pb-[2px] pt-[8px]">
                <AnimatePresence mode="wait" initial={false}>
                  {error && errorField !== "username" && (
                    <motion.p
                      key={error}
                      id="auth-form-error"
                      role="alert"
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="m-0 text-[12px] font-[500] leading-[1.4] text-[#ff5c72]"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence initial={false} mode="popLayout">
                {mode === "login" ? (
                  <motion.div
                    key="login-footer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full"
                    >
                      {submitting ? (
                        <>
                          <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-current border-t-transparent" />
                          <span>{t("login.btn_signing_in")}</span>
                        </>
                      ) : (
                        t("login.btn_sign_in")
                      )}
                    </Button>
                  </motion.div>
                ) : registerStep === 1 ? (
                  <motion.div
                    key="register-step1-footer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full"
                    >
                      {t("login.btn_continue")}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="register-step2-footer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                    className="flex items-center gap-[10px]"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => {
                        setError("");
                        setRegisterStep(1);
                      }}
                      className="w-[104px] shrink-0"
                    >
                      <ArrowLeftLine className="h-4 w-4" />
                      <span>{t("login.btn_back")}</span>
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting || usernameTaken}
                      className="flex-1"
                    >
                      {submitting ? (
                        <>
                          <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-current border-t-transparent" />
                          <span>{t("login.btn_creating_account")}</span>
                        </>
                      ) : (
                        t("login.btn_create_account")
                      )}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </section>

          <p className="m-0 px-2 text-center text-[11px] leading-[1.5] text-white/35">
            {t("login.legal")}{" "}
            <a
              href="https://tryliner.fun/terms"
              target="_blank"
              rel="noreferrer"
              className="rounded-xs text-white/60 underline underline-offset-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              {t("login.legal_tos")}
            </a>{" "}
            {t("login.legal_and")}{" "}
            <a
              href="https://tryliner.fun/privacy"
              target="_blank"
              rel="noreferrer"
              className="rounded-xs text-white/60 underline underline-offset-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              {t("login.legal_pp")}
            </a>
            .
          </p>
        </motion.div>
      </div>

      <HumanCheckNotice />
    </main>
  );
}
