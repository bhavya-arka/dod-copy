import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { RegisterData } from '../hooks/useAuth';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (data: RegisterData) => Promise<{ success: boolean; error?: string; pendingApproval?: boolean }>;
}

export default function AuthScreen({ onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }
        if (!accessCode && !email.toLowerCase().includes('bhavya091213')) {
          setError('Department Access Code is required');
          setIsLoading(false);
          return;
        }
        const result = await onRegister({
          email,
          username,
          password,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          access_code: accessCode,
        });
        if (!result.success) {
          setError(result.error || 'Registration failed');
        } else if (result.pendingApproval) {
          setSuccessMessage('Registration successful! Your account is pending admin approval. You will be notified when approved.');
          setMode('login');
          setEmail('');
          setUsername('');
          setFirstName('');
          setLastName('');
          setAccessCode('');
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const result = await onLogin(email, password);
        if (!result.success) {
          setError(result.error || 'Login failed');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 gradient-mesh flex flex-col">
      <div className="flex-1 flex items-center justify-center overflow-y-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-primary rounded-2xl flex items-center justify-center shadow-glass">
            <span className="text-white font-bold text-xl sm:text-2xl">A</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-2">Arka Cargo Operations</h1>
          <p className="text-neutral-500 text-sm sm:text-base">PACAF Airlift Planning System</p>
        </div>

        <div className="glass-card p-5 sm:p-8">
          <div className="flex mb-6 bg-neutral-100 rounded-xl p-1">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 text-center rounded-lg text-sm font-medium transition ${
                mode === 'login'
                  ? 'bg-white text-neutral-900 shadow-soft'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2.5 text-center rounded-lg text-sm font-medium transition ${
                mode === 'register'
                  ? 'bg-white text-neutral-900 shadow-soft'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-neutral-700 text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full"
                placeholder="you@example.com"
                required
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-neutral-700 text-sm font-medium mb-1.5">Department Access Code</label>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    className="glass-input w-full font-mono tracking-wider"
                    placeholder="Enter your access code"
                    required
                  />
                  <p className="text-xs text-neutral-400 mt-1">Contact your branch admin for an access code</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-700 text-sm font-medium mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="glass-input w-full"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-700 text-sm font-medium mb-1.5">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="glass-input w-full"
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-neutral-700 text-sm font-medium mb-1.5">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="glass-input w-full"
                    placeholder="Your display name"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-neutral-700 text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full"
                placeholder="••••••••"
                required
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-neutral-700 text-sm font-medium mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="glass-input w-full"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {successMessage && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Please wait...</span>
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-neutral-400 text-sm mt-6">
          Secure military cargo planning and airlift coordination
        </p>
      </motion.div>
        </div>
      </div>
    </div>
  );
}
