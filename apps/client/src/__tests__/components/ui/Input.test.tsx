import { jest, describe, it, expect } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react';
import * as userEventLib from '@testing-library/user-event';
import { Input } from '../../../components/ui/input';

const userEvent = userEventLib.default;

describe('Input Component', () => {
  describe('Rendering', () => {
    it('should render input with placeholder', () => {
      render(<Input placeholder="Enter your email" />);

      expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    });

    it('should render input with default behavior as text', () => {
      render(<Input placeholder="Text input" />);

      const input = screen.getByPlaceholderText('Text input') as HTMLInputElement;
      expect(input.type).toBe('text');
    });

    it('should render input with specified type', () => {
      render(<Input type="email" placeholder="Email" />);

      const input = screen.getByPlaceholderText('Email');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('should render password input', () => {
      render(<Input type="password" placeholder="Password" />);

      const input = screen.getByPlaceholderText('Password');
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  describe('Controlled Value', () => {
    it('should display controlled value', () => {
      render(<Input value="test value" onChange={() => {}} />);

      const input = screen.getByDisplayValue('test value');
      expect(input).toBeInTheDocument();
    });

    it('should update value when changed externally', () => {
      const { rerender } = render(<Input value="initial" onChange={() => {}} />);

      expect(screen.getByDisplayValue('initial')).toBeInTheDocument();

      rerender(<Input value="updated" onChange={() => {}} />);

      expect(screen.getByDisplayValue('updated')).toBeInTheDocument();
    });
  });

  describe('onChange Handler', () => {
    it('should fire onChange when user types', async () => {
      const handleChange = jest.fn();
      render(<Input onChange={handleChange} placeholder="Type here" />);

      const input = screen.getByPlaceholderText('Type here');
      await userEvent.type(input, 'hello');

      expect(handleChange).toHaveBeenCalled();
      expect(handleChange).toHaveBeenCalledTimes(5);
    });

    it('should receive input event with new value', async () => {
      const handleChange = jest.fn();
      render(<Input onChange={handleChange} placeholder="Type here" />);

      const input = screen.getByPlaceholderText('Type here');
      await userEvent.type(input, 'a');

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            value: 'a',
          }),
        })
      );
    });
  });

  describe('Disabled State', () => {
    it('should apply disabled state', () => {
      render(<Input disabled placeholder="Disabled input" />);

      const input = screen.getByPlaceholderText('Disabled input');
      expect(input).toBeDisabled();
    });

    it('should have disabled styling', () => {
      render(<Input disabled placeholder="Disabled input" />);

      const input = screen.getByPlaceholderText('Disabled input');
      expect(input).toHaveClass('disabled:cursor-not-allowed');
      expect(input).toHaveClass('disabled:opacity-50');
    });

    it('should not accept input when disabled', async () => {
      const handleChange = jest.fn();
      render(<Input disabled onChange={handleChange} placeholder="Disabled" />);

      const input = screen.getByPlaceholderText('Disabled');
      await userEvent.type(input, 'test');

      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  describe('Required Attribute', () => {
    it('should support required attribute', () => {
      render(<Input required placeholder="Required field" />);

      const input = screen.getByPlaceholderText('Required field');
      expect(input).toHaveAttribute('required');
    });

    it('should work in a form with required validation', () => {
      render(
        <form>
          <Input required placeholder="Required" />
        </form>
      );

      const input = screen.getByPlaceholderText('Required');
      expect(input).toBeRequired();
    });
  });

  describe('Styling', () => {
    it('should apply base input styles', () => {
      render(<Input placeholder="Styled input" />);

      const input = screen.getByPlaceholderText('Styled input');
      expect(input).toHaveClass('flex');
      expect(input).toHaveClass('h-9');
      expect(input).toHaveClass('w-full');
      expect(input).toHaveClass('rounded-md');
      expect(input).toHaveClass('border');
      expect(input).toHaveClass('border-input');
    });

    it('should apply custom className', () => {
      render(<Input className="custom-input-class" placeholder="Custom styled" />);

      const input = screen.getByPlaceholderText('Custom styled');
      expect(input).toHaveClass('custom-input-class');
      expect(input).toHaveClass('flex');
    });

    it('should have focus ring styling', () => {
      render(<Input placeholder="Focusable" />);

      const input = screen.getByPlaceholderText('Focusable');
      expect(input).toHaveClass('focus-visible:outline-none');
      expect(input).toHaveClass('focus-visible:ring-1');
      expect(input).toHaveClass('focus-visible:ring-ring');
    });

    it('should have placeholder styling', () => {
      render(<Input placeholder="Placeholder text" />);

      const input = screen.getByPlaceholderText('Placeholder text');
      expect(input).toHaveClass('placeholder:text-muted-foreground');
    });
  });

  describe('Label Association', () => {
    it('should be associated with label via id', () => {
      render(
        <>
          <label htmlFor="email-input">Email</label>
          <Input id="email-input" placeholder="Enter email" />
        </>
      );

      const input = screen.getByLabelText('Email');
      expect(input).toBeInTheDocument();
    });

    it('should support aria-label', () => {
      render(<Input aria-label="Search input" placeholder="Search" />);

      const input = screen.getByLabelText('Search input');
      expect(input).toBeInTheDocument();
    });

    it('should support aria-labelledby', () => {
      render(
        <>
          <span id="label-id">My Label</span>
          <Input aria-labelledby="label-id" placeholder="Input" />
        </>
      );

      const input = screen.getByPlaceholderText('Input');
      expect(input).toHaveAttribute('aria-labelledby', 'label-id');
    });
  });

  describe('Additional Attributes', () => {
    it('should support name attribute', () => {
      render(<Input name="username" placeholder="Username" />);

      const input = screen.getByPlaceholderText('Username');
      expect(input).toHaveAttribute('name', 'username');
    });

    it('should support maxLength attribute', () => {
      render(<Input maxLength={10} placeholder="Limited" />);

      const input = screen.getByPlaceholderText('Limited');
      expect(input).toHaveAttribute('maxLength', '10');
    });

    it('should support autocomplete attribute', () => {
      render(<Input autoComplete="email" placeholder="Email" />);

      const input = screen.getByPlaceholderText('Email');
      expect(input).toHaveAttribute('autocomplete', 'email');
    });

    it('should support readOnly attribute', () => {
      render(<Input readOnly value="Read only value" onChange={() => {}} />);

      const input = screen.getByDisplayValue('Read only value');
      expect(input).toHaveAttribute('readonly');
    });
  });

  describe('File Input', () => {
    it('should support file input type', () => {
      render(<Input type="file" data-testid="file-input" />);

      const input = screen.getByTestId('file-input');
      expect(input).toHaveAttribute('type', 'file');
    });

    it('should have file input styling', () => {
      render(<Input type="file" data-testid="file-input" />);

      const input = screen.getByTestId('file-input');
      expect(input).toHaveClass('file:border-0');
      expect(input).toHaveClass('file:bg-transparent');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref to input element', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} placeholder="Ref test" />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.placeholder).toBe('Ref test');
    });
  });
});
