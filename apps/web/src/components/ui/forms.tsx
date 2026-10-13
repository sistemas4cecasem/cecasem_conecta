import { Children, cloneElement, Fragment, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from 'react';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={`ui-control ${className}`} />;
}
export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={`ui-control ${className}`} />;
}
export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={`ui-control ui-textarea ${className}`} />;
}

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}
export interface FormFieldProps {
  label: string;
  id?: string;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  describedBy?: string;
  children: ((control: FieldControlProps) => ReactNode) | ReactNode;
}

type FieldChildProps = { id?: string; children?: ReactNode; 'aria-describedby'?: string; 'aria-invalid'?: boolean };
// Compatibilidad con los campos existentes: conserva ref, register y handlers.
function findControl(children: ReactNode): ReactElement<FieldChildProps> | undefined {
  let found: ReactElement<FieldChildProps> | undefined;
  Children.forEach(children, child => {
    if (found || !isValidElement<FieldChildProps>(child)) return;
    if (child.type === Fragment) found = findControl(child.props.children);
    if (child.type === 'input' || child.type === 'select' || child.type === 'textarea' || child.type === Input || child.type === Select || child.type === Textarea) found = child;
  });
  return found;
}
function associateControl(children: ReactNode, target: ReactElement<FieldChildProps> | undefined, control: FieldControlProps): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement<FieldChildProps>(child)) return child;
    if (child === target) return cloneElement(child, { ...control,
      'aria-describedby': [child.props['aria-describedby'], control['aria-describedby']].filter(Boolean).join(' ') || undefined,
      'aria-invalid': control['aria-invalid'] ?? child.props['aria-invalid'] });
    return child.type === Fragment ? cloneElement(child, { children: associateControl(child.props.children, target, control) }) : child;
  });
}

// La función de render conserva register, name, ref y los handlers del control.
export function FormField({ label, id, help, error, required, describedBy, children }: FormFieldProps) {
  const generatedId = useId();
  const existingControl = typeof children === 'function' ? undefined : findControl(children);
  const controlId = id ?? existingControl?.props.id ?? generatedId;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptions = [describedBy, helpId, errorId].filter(Boolean).join(' ') || undefined;
  return <div className="ui-field">
    <label htmlFor={controlId} className="ui-field-label">{label}{required && <span className="ui-required"> (obligatorio)</span>}</label>
    {typeof children === 'function' ? children({ id: controlId, 'aria-describedby': descriptions, 'aria-invalid': error ? true : undefined })
      : associateControl(children, existingControl, { id: controlId, 'aria-describedby': descriptions, 'aria-invalid': error ? true : undefined })}
    {help && <FieldHelp id={helpId}>{help}</FieldHelp>}
    {error && <p id={errorId} role="alert" className="ui-field-error">{error}</p>}
  </div>;
}

export function FieldHelp({ className = '', ...props }: ComponentProps<'p'>) {
  return <p {...props} className={`ui-field-help ${className}`} />;
}
export function FormSection({ heading, description, children, className = '', ...props }: ComponentProps<'fieldset'> & {
  heading: string; description?: ReactNode;
}) {
  return <fieldset {...props} className={`ui-form-section ${className}`}>
    <legend>{heading}</legend>{description && <p className="ui-description">{description}</p>}{children}
  </fieldset>;
}
export function FormActions({ className = '', ...props }: ComponentProps<'div'>) {
  return <div {...props} className={`ui-actions ui-form-actions ${className}`} />;
}
