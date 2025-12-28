import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import * as userEventLib from '@testing-library/user-event';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../../../components/ui/dialog';

const userEvent = userEventLib.default;

describe('Dialog Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Opening and Closing', () => {
    it('should open dialog when trigger is clicked', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText('Dialog Content')).not.toBeInTheDocument();

      await userEvent.click(screen.getByText('Open Dialog'));

      expect(await screen.findByText('Dialog Content')).toBeInTheDocument();
    });

    it('should close dialog when close button is clicked', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>
      );

      await userEvent.click(screen.getByText('Open Dialog'));
      expect(await screen.findByText('Dialog Content')).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: /close/i });
      await userEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Dialog Content')).not.toBeInTheDocument();
      });
    });

    it('should close dialog when escape key is pressed', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>
      );

      await userEvent.click(screen.getByText('Open Dialog'));
      expect(await screen.findByText('Dialog Content')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByText('Dialog Content')).not.toBeInTheDocument();
      });
    });

    it('should close dialog when overlay is clicked', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog Title</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>
      );

      await userEvent.click(screen.getByText('Open Dialog'));
      expect(await screen.findByText('Dialog Content')).toBeInTheDocument();

      const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
      if (overlay) {
        await userEvent.click(overlay);
      }

      await waitFor(() => {
        expect(screen.queryByText('Dialog Content')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Content Rendering', () => {
    it('should render dialog title correctly', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>My Dialog Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(await screen.findByText('My Dialog Title')).toBeInTheDocument();
    });

    it('should render dialog description correctly', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>This is a description of the dialog</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(await screen.findByText('This is a description of the dialog')).toBeInTheDocument();
    });

    it('should render dialog content correctly', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <div data-testid="custom-content">Custom Dialog Content</div>
          </DialogContent>
        </Dialog>
      );

      expect(await screen.findByTestId('custom-content')).toBeInTheDocument();
    });

    it('should render DialogHeader with proper styling', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader data-testid="dialog-header">
              <DialogTitle>Header Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      const header = await screen.findByTestId('dialog-header');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
    });

    it('should render DialogFooter with proper styling', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogFooter data-testid="dialog-footer">
              <button>Cancel</button>
              <button>Submit</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      const footer = await screen.findByTestId('dialog-footer');
      expect(footer).toHaveClass('flex');
    });
  });

  describe('Accessibility', () => {
    it('should have close button with accessible name', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <p>Content</p>
          </DialogContent>
        </Dialog>
      );

      const closeButton = await screen.findByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('should render DialogTitle with proper styling', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle data-testid="title">Accessible Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      const title = await screen.findByTestId('title');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
    });

    it('should render DialogDescription with muted styling', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription data-testid="description">Description text</DialogDescription>
          </DialogContent>
        </Dialog>
      );

      const description = await screen.findByTestId('description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });
  });

  describe('DialogClose Component', () => {
    it('should close dialog when DialogClose is clicked', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogClose>Close Me</DialogClose>
          </DialogContent>
        </Dialog>
      );

      await userEvent.click(screen.getByText('Open'));
      expect(await screen.findByText('Close Me')).toBeInTheDocument();

      await userEvent.click(screen.getByText('Close Me'));

      await waitFor(() => {
        expect(screen.queryByText('Close Me')).not.toBeInTheDocument();
      });
    });
  });

  describe('Controlled Dialog', () => {
    it('should support controlled open state', async () => {
      const TestComponent = () => {
        const [open, setOpen] = React.useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>External Open</button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogTitle>Controlled Dialog</DialogTitle>
                <p>Controlled content</p>
              </DialogContent>
            </Dialog>
          </>
        );
      };

      render(<TestComponent />);

      expect(screen.queryByText('Controlled content')).not.toBeInTheDocument();

      await userEvent.click(screen.getByText('External Open'));

      expect(await screen.findByText('Controlled content')).toBeInTheDocument();
    });
  });

  describe('Dialog Content Styling', () => {
    it('should apply proper content styling', async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>Styled Dialog</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      const content = await screen.findByTestId('dialog-content');
      expect(content).toHaveClass('fixed');
      expect(content).toHaveClass('z-50');
      expect(content).toHaveClass('bg-background');
      expect(content).toHaveClass('shadow-lg');
    });
  });
});
