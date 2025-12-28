import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as userEventLib from '@testing-library/user-event';
import AuthScreen from '../../components/AuthScreen';

const userEvent = userEventLib.default;

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('AuthScreen', () => {
  const mockOnLogin = jest.fn<(email: string, password: string) => Promise<{ success: boolean; error?: string }>>();
  const mockOnRegister = jest.fn<(email: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnLogin.mockResolvedValue({ success: true });
    mockOnRegister.mockResolvedValue({ success: true });
  });

  describe('Rendering', () => {
    it('should render login form by default', () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      expect(screen.getByText('Arka Cargo Operations')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Sign In/i }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Your display name')).not.toBeInTheDocument();
    });

    it('should switch to register tab when clicked', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      const registerTab = screen.getByRole('button', { name: 'Register' });
      await userEvent.click(registerTab);

      expect(screen.getByPlaceholderText('Your display name')).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText('••••••••')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    });

    it('should display PACAF subtitle', () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      expect(screen.getByText('PACAF Airlift Planning System')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should require email input', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      const emailInput = screen.getByPlaceholderText('you@example.com');
      expect(emailInput).toHaveAttribute('required');
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('should require password input', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      const passwordInput = screen.getByPlaceholderText('••••••••');
      expect(passwordInput).toHaveAttribute('required');
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should show error when passwords do not match during registration', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.click(screen.getByRole('button', { name: 'Register' }));

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await userEvent.type(screen.getByPlaceholderText('Your display name'), 'testuser');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      await userEvent.type(passwordInputs[0], 'password123');
      await userEvent.type(passwordInputs[1], 'differentpassword');

      await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
      expect(mockOnRegister).not.toHaveBeenCalled();
    });

    it('should show error when password is too short during registration', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.click(screen.getByRole('button', { name: 'Register' }));

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await userEvent.type(screen.getByPlaceholderText('Your display name'), 'testuser');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      await userEvent.type(passwordInputs[0], '12345');
      await userEvent.type(passwordInputs[1], '12345');

      await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument();
      expect(mockOnRegister).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('should submit login form with correct credentials', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com');
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123');
      const submitButtons = screen.getAllByRole('button', { name: /Sign In/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit') || submitButtons[submitButtons.length - 1];
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnLogin).toHaveBeenCalledWith('user@example.com', 'password123');
      });
    });

    it('should submit registration form with correct data', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.click(screen.getByRole('button', { name: 'Register' }));

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'newuser@example.com');
      await userEvent.type(screen.getByPlaceholderText('Your display name'), 'newuser');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      await userEvent.type(passwordInputs[0], 'password123');
      await userEvent.type(passwordInputs[1], 'password123');

      await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockOnRegister).toHaveBeenCalledWith('newuser@example.com', 'newuser', 'password123');
      });
    });

    it('should show error on invalid credentials', async () => {
      mockOnLogin.mockResolvedValue({ success: false, error: 'Invalid credentials' });

      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'wrong@example.com');
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrongpassword');
      const submitButtons = screen.getAllByRole('button', { name: /Sign In/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit') || submitButtons[submitButtons.length - 1];
      await userEvent.click(submitButton);

      expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    });

    it('should show error on duplicate email during registration', async () => {
      mockOnRegister.mockResolvedValue({ success: false, error: 'Email already exists' });

      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.click(screen.getByRole('button', { name: 'Register' }));

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'existing@example.com');
      await userEvent.type(screen.getByPlaceholderText('Your display name'), 'existinguser');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      await userEvent.type(passwordInputs[0], 'password123');
      await userEvent.type(passwordInputs[1], 'password123');

      await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(await screen.findByText('Email already exists')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading state during form submission', async () => {
      mockOnLogin.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100)));

      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com');
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123');

      const submitButtons = screen.getAllByRole('button', { name: /Sign In/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit') || submitButtons[submitButtons.length - 1];
      await userEvent.click(submitButton);

      expect(await screen.findByText('Please wait...')).toBeInTheDocument();
    });

    it('should disable submit button while loading', async () => {
      mockOnLogin.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100)));

      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com');
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123');

      const submitButtons = screen.getAllByRole('button', { name: /Sign In/i });
      const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit') || submitButtons[submitButtons.length - 1];
      await userEvent.click(submitButton);

      const loadingButton = await screen.findByText('Please wait...');
      expect(loadingButton.closest('button')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Password')).toBeInTheDocument();
    });

    it('should have accessible tab buttons', async () => {
      render(<AuthScreen onLogin={mockOnLogin} onRegister={mockOnRegister} />);

      const tabButtons = screen.getAllByRole('button', { name: /Sign In/i });
      const registerTab = screen.getByRole('button', { name: 'Register' });

      expect(tabButtons.length).toBeGreaterThanOrEqual(1);
      expect(registerTab).toBeInTheDocument();
    });
  });
});
