import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { AuthLayout } from '../../components/auth-layout'
import { AuthField, Icon } from '../../components/ui'
import { FormMessage } from '../shared'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('superadmin@local.dev')
  const [password, setPassword] = useState('DevPass123!')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const flashMessage =
    typeof location.state === 'object' && location.state && 'message' in location.state
      ? String(location.state.message)
      : ''

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError('')

    const result = await login({ email, password })

    setPending(false)
    if (!result.ok) {
      setError(result.error ?? 'Unable to login.')
      return
    }

    navigate('/app', { replace: true })
  }

  return (
    <AuthLayout
      title="Login"
      subtitle="Use your BugCatcher account"
      navLabel="Sign Up"
      navTo="/signup"
      footer={
        <p>
          No account? <Link to="/signup">Sign Up</Link>
        </p>
      }
    >
      <form className="auth-stack" onSubmit={handleSubmit}>
        {flashMessage ? <FormMessage tone="success">{flashMessage}</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <AuthField
          label="Email"
          placeholder="superadmin@local.dev"
          icon="mail"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <AuthField
          label="Password"
          placeholder="Enter password"
          icon="lock"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />

        <div className="auth-actions-row">
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? 'Signing In...' : 'Login'}
          </button>
          <Link className="button button--ghost" to="/forgot-password">
            Forgot
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError('')

    const result = await signup({ username, email, password, confirmPassword })

    setPending(false)
    if (!result.ok) {
      setError(result.error ?? 'Unable to create account.')
      return
    }

    navigate('/login', {
      replace: true,
      state: {
        message: result.message ?? 'Account created. You can now log in.',
      },
    })
  }

  return (
    <AuthLayout
      title="Sign Up"
      subtitle="Create your BugCatcher account"
      navLabel="Login"
      navTo="/login"
      footer={
        <p>
          Have account? <Link to="/login">Login</Link>
        </p>
      }
    >
      <form className="auth-stack" onSubmit={handleSubmit}>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <AuthField
          label="Username"
          placeholder="superadmin"
          icon="users"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <AuthField
          label="Email"
          placeholder="superadmin@local.dev"
          icon="mail"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <AuthField
          label="Password"
          placeholder="Create password"
          icon="lock"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <AuthField
          label="Confirm"
          placeholder="Repeat password"
          icon="lock"
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <div className="auth-actions-row">
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const { requestOtp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError('')

    const result = await requestOtp(email)
    setPending(false)

    if (!result.ok) {
      setError(result.error ?? 'Unable to send reset code.')
      return
    }

    navigate(`/forgot-password/verify?email=${encodeURIComponent(email)}`, {
      state: { message: result.message ?? 'OTP sent. Check your inbox.' },
    })
  }

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Send OTP"
      navLabel="Login"
      navTo="/login"
      footer={
        <p>
          Back to <Link to="/login">Login</Link>
        </p>
      }
    >
      <form className="auth-stack" onSubmit={handleSubmit}>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <AuthField
          label="Email"
          placeholder="superadmin@local.dev"
          icon="mail"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <div className="auth-actions-row">
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? 'Sending...' : 'Send OTP'}
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordVerifyPage() {
  const { resendOtp, resetPassword, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email')?.trim() ?? ''
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState(
    typeof location.state === 'object' && location.state && 'message' in location.state
      ? String(location.state.message)
      : '',
  )
  const [pending, setPending] = useState(false)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email) {
      setError('Email is missing. Start the reset flow again.')
      return
    }

    setPending(true)
    setError('')
    setMessage('')

    const verification = await verifyOtp(email, otp)
    if (!verification.ok) {
      setPending(false)
      setError(verification.error ?? 'Unable to verify code.')
      return
    }

    const reset = await resetPassword({ email, password, confirmPassword })
    setPending(false)

    if (!reset.ok) {
      setError(reset.error ?? 'Unable to reset password.')
      return
    }

    navigate('/forgot-password/success', {
      replace: true,
      state: {
        message: reset.message ?? 'Password updated. You can now log in.',
      },
    })
  }

  const handleResend = async () => {
    if (!email) {
      setError('Email is missing. Start the reset flow again.')
      return
    }

    setResending(true)
    setError('')

    const result = await resendOtp(email)
    setResending(false)

    if (!result.ok) {
      setError(result.error ?? 'Unable to resend reset code.')
      return
    }

    setMessage(result.message ?? 'A fresh code has been sent.')
  }

  return (
    <AuthLayout
      title="OTP Verify"
      subtitle={email ? `Reset for ${email}` : '6-digit code'}
      navLabel="Login"
      navTo="/login"
      footer={
        <p>
          Need new code?{' '}
          <button type="button" className="inline-link" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending...' : 'Resend'}
          </button>
        </p>
      }
    >
      <form className="auth-stack" onSubmit={handleSubmit}>
        {message ? <FormMessage tone="info">{message}</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <AuthField
          label="OTP"
          placeholder="382147"
          icon="alert"
          name="otp"
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
          disabled={pending}
          inputMode="numeric"
          maxLength={6}
          error={Boolean(error)}
        />
        <AuthField
          label="New Password"
          placeholder="New password"
          icon="lock"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <AuthField
          label="Confirm"
          placeholder="Repeat password"
          icon="lock"
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={pending}
          error={Boolean(error)}
        />
        <div className="auth-actions-row">
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? 'Resetting...' : 'Reset'}
          </button>
          <button type="button" className="button button--ghost" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending...' : 'Resend'}
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordSuccessPage() {
  const location = useLocation()
  const message =
    typeof location.state === 'object' && location.state && 'message' in location.state
      ? String(location.state.message)
      : 'Use your new password to sign in.'

  return (
    <AuthLayout title="Reset Success" subtitle="Password updated" navLabel="Login" navTo="/login">
      <div className="success-panel">
        <div className="success-panel__icon">
          <Icon name="checklist" />
        </div>
        <div>
          <h3>All set</h3>
          <p>{message}</p>
        </div>
      </div>
      <div className="auth-actions-row">
        <Link className="button button--primary" to="/login">
          Login
        </Link>
      </div>
    </AuthLayout>
  )
}
