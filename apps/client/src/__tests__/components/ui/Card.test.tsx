import { jest, describe, it, expect } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../../components/ui/card';

describe('Card Component', () => {
  describe('Card', () => {
    it('should render children correctly', () => {
      render(
        <Card>
          <div data-testid="card-child">Content</div>
        </Card>
      );

      expect(screen.getByTestId('card-child')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should apply base card styles', () => {
      render(<Card data-testid="card">Card Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('shadow');
    });

    it('should merge custom className with default styles', () => {
      render(<Card className="custom-card-class" data-testid="card">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('custom-card-class');
      expect(card).toHaveClass('rounded-xl');
    });

    it('should forward additional props', () => {
      render(<Card data-testid="card" id="my-card" role="article">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('id', 'my-card');
      expect(card).toHaveAttribute('role', 'article');
    });
  });

  describe('CardHeader', () => {
    it('should render header content', () => {
      render(
        <Card>
          <CardHeader>
            <span data-testid="header-content">Header</span>
          </CardHeader>
        </Card>
      );

      expect(screen.getByTestId('header-content')).toBeInTheDocument();
    });

    it('should apply header styles', () => {
      render(
        <Card>
          <CardHeader data-testid="card-header">Header</CardHeader>
        </Card>
      );

      const header = screen.getByTestId('card-header');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
      expect(header).toHaveClass('space-y-1.5');
      expect(header).toHaveClass('p-6');
    });

    it('should merge custom className', () => {
      render(
        <Card>
          <CardHeader className="custom-header" data-testid="card-header">Header</CardHeader>
        </Card>
      );

      const header = screen.getByTestId('card-header');
      expect(header).toHaveClass('custom-header');
      expect(header).toHaveClass('p-6');
    });
  });

  describe('CardTitle', () => {
    it('should render title text', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>My Card Title</CardTitle>
          </CardHeader>
        </Card>
      );

      expect(screen.getByText('My Card Title')).toBeInTheDocument();
    });

    it('should apply title styles', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle data-testid="card-title">Title</CardTitle>
          </CardHeader>
        </Card>
      );

      const title = screen.getByTestId('card-title');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('tracking-tight');
    });
  });

  describe('CardDescription', () => {
    it('should render description text', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>This is a description</CardDescription>
          </CardHeader>
        </Card>
      );

      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('should apply description styles', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription data-testid="card-desc">Description</CardDescription>
          </CardHeader>
        </Card>
      );

      const description = screen.getByTestId('card-desc');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });
  });

  describe('CardContent', () => {
    it('should render content children', () => {
      render(
        <Card>
          <CardContent>
            <p data-testid="content-text">Main content here</p>
          </CardContent>
        </Card>
      );

      expect(screen.getByTestId('content-text')).toBeInTheDocument();
    });

    it('should apply content styles', () => {
      render(
        <Card>
          <CardContent data-testid="card-content">Content</CardContent>
        </Card>
      );

      const content = screen.getByTestId('card-content');
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });

    it('should merge custom className', () => {
      render(
        <Card>
          <CardContent className="custom-content" data-testid="card-content">Content</CardContent>
        </Card>
      );

      const content = screen.getByTestId('card-content');
      expect(content).toHaveClass('custom-content');
      expect(content).toHaveClass('p-6');
    });
  });

  describe('CardFooter', () => {
    it('should render footer children', () => {
      render(
        <Card>
          <CardFooter>
            <button data-testid="footer-button">Action</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByTestId('footer-button')).toBeInTheDocument();
    });

    it('should apply footer styles', () => {
      render(
        <Card>
          <CardFooter data-testid="card-footer">Footer</CardFooter>
        </Card>
      );

      const footer = screen.getByTestId('card-footer');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('p-6');
      expect(footer).toHaveClass('pt-0');
    });

    it('should merge custom className', () => {
      render(
        <Card>
          <CardFooter className="custom-footer" data-testid="card-footer">Footer</CardFooter>
        </Card>
      );

      const footer = screen.getByTestId('card-footer');
      expect(footer).toHaveClass('custom-footer');
      expect(footer).toHaveClass('flex');
    });
  });

  describe('Full Card Composition', () => {
    it('should render complete card with all subcomponents', () => {
      render(
        <Card data-testid="full-card">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Main content area</p>
          </CardContent>
          <CardFooter>
            <button>Action Button</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByTestId('full-card')).toBeInTheDocument();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card Description')).toBeInTheDocument();
      expect(screen.getByText('Main content area')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
    });
  });
});
