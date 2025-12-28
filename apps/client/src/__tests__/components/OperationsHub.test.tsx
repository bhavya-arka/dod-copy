import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import * as userEventLib from '@testing-library/user-event';
import OperationsHub, { OperationMode } from '../../components/OperationsHub';
import type { User } from '../../hooks/useAuth';

const userEvent = userEventLib.default;

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));


describe('OperationsHub', () => {
  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    username: 'TestUser',
  };

  const mockOnLogout = jest.fn();
  const mockOnSelectMode = jest.fn<(mode: OperationMode) => void>();

  const defaultProps = {
    user: mockUser,
    onLogout: mockOnLogout,
    onSelectMode: mockOnSelectMode,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all 4 operation tiles', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Air Operations')).toBeInTheDocument();
      expect(screen.getByText('Land Logistics')).toBeInTheDocument();
      expect(screen.getByText('Sea Freight')).toBeInTheDocument();
      expect(screen.getByText('Warehouse Management')).toBeInTheDocument();
    });

    it('should display welcome message with username', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Welcome back, TestUser')).toBeInTheDocument();
    });

    it('should display welcome message with "Operator" when no username', () => {
      const userWithoutUsername = { ...mockUser, username: '' };
      render(<OperationsHub {...defaultProps} user={userWithoutUsername} />);

      expect(screen.getByText('Welcome back, Operator')).toBeInTheDocument();
    });

    it('should render navigation header with platform title', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Arka Cargo Operations')).toBeInTheDocument();
      expect(screen.getByText('Multi-Modal Logistics Platform')).toBeInTheDocument();
    });

    it('should display user info in the header', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('TestUser')).toBeInTheDocument();
    });
  });

  describe('Operation Tile Interactions', () => {
    it('should call onSelectMode with "air" when Air Operations is clicked', async () => {
      render(<OperationsHub {...defaultProps} />);

      const airTile = screen.getByText('Air Operations').closest('button');
      await userEvent.click(airTile!);

      expect(mockOnSelectMode).toHaveBeenCalledWith('air');
    });

    it('should call onSelectMode with "land" when Land Logistics is clicked', async () => {
      render(<OperationsHub {...defaultProps} />);

      const landTile = screen.getByText('Land Logistics').closest('button');
      await userEvent.click(landTile!);

      expect(mockOnSelectMode).toHaveBeenCalledWith('land');
    });

    it('should call onSelectMode with "sea" when Sea Freight is clicked', async () => {
      render(<OperationsHub {...defaultProps} />);

      const seaTile = screen.getByText('Sea Freight').closest('button');
      await userEvent.click(seaTile!);

      expect(mockOnSelectMode).toHaveBeenCalledWith('sea');
    });

    it('should call onSelectMode with "warehouse" when Warehouse Management is clicked', async () => {
      render(<OperationsHub {...defaultProps} />);

      const warehouseTile = screen.getByText('Warehouse Management').closest('button');
      await userEvent.click(warehouseTile!);

      expect(mockOnSelectMode).toHaveBeenCalledWith('warehouse');
    });
  });

  describe('Icons', () => {
    it('should render all operation icons correctly', () => {
      const { container } = render(<OperationsHub {...defaultProps} />);

      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('should render feature icons in bottom section', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Real-time Tracking')).toBeInTheDocument();
      expect(screen.getByText('Multi-Site Support')).toBeInTheDocument();
      expect(screen.getByText('AI Insights')).toBeInTheDocument();
    });
  });

  describe('Logout', () => {
    it('should call onLogout when logout button is clicked', async () => {
      render(<OperationsHub {...defaultProps} />);

      const logoutButton = screen.getByText('Logout').closest('button');
      await userEvent.click(logoutButton!);

      expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });

    it('should render logout button with icon', () => {
      const { container } = render(<OperationsHub {...defaultProps} />);

      const logoutButton = screen.getByText('Logout').closest('button');
      expect(logoutButton).toBeInTheDocument();
      expect(logoutButton?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Feature Cards', () => {
    it('should render Real-time Tracking feature', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Real-time Tracking')).toBeInTheDocument();
      expect(screen.getByText('Live cargo monitoring')).toBeInTheDocument();
    });

    it('should render Multi-Site Support feature', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Multi-Site Support')).toBeInTheDocument();
      expect(screen.getByText('Global operations')).toBeInTheDocument();
    });

    it('should render AI Insights feature', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('AI Insights')).toBeInTheDocument();
      expect(screen.getByText('Optimization recommendations')).toBeInTheDocument();
    });
  });

  describe('Footer', () => {
    it('should render footer with platform info', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('Arka Cargo Operations Platform')).toBeInTheDocument();
      expect(screen.getByText('Air | Land | Sea | Warehouse')).toBeInTheDocument();
    });
  });

  describe('Tile Details', () => {
    it('should display operation descriptions', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText(/C-17\/C-130 load planning/)).toBeInTheDocument();
      expect(screen.getByText(/Convoy planning/)).toBeInTheDocument();
      expect(screen.getByText(/Container planning/)).toBeInTheDocument();
      expect(screen.getByText(/Multi-site inventory tracking/)).toBeInTheDocument();
    });

    it('should display operation subtitles', () => {
      render(<OperationsHub {...defaultProps} />);

      expect(screen.getByText('PACAF Airlift System')).toBeInTheDocument();
      expect(screen.getByText('Ground Transport')).toBeInTheDocument();
      expect(screen.getByText('Maritime Operations')).toBeInTheDocument();
      expect(screen.getByText('Inventory & Storage')).toBeInTheDocument();
    });
  });
});
