import { useId, type ChangeEvent } from 'react'
import { cn } from '../../lib/cn'

/** default = empty, filled = AI filled it, edited = AI just changed it */
export type FieldState = 'default' | 'filled' | 'edited'

interface CommonInputProps {
  label: string
  value?: string
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  placeholder?: string
  type?: string
  className?: string
  state?: FieldState
  multiline?: boolean
  rows?: number
  readOnly?: boolean
  /** Span both columns inside a FieldGrid */
  fullWidth?: boolean
}

const fieldBase =
  'w-full rounded-field border border-line bg-panel px-2.5 text-[12.5px] text-ink outline-none ' +
  'transition-[background-color,border-color,box-shadow] duration-300 placeholder:text-muted-2 ' +
  'focus:border-brand focus:ring-3 focus:ring-brand/15 read-only:cursor-default read-only:focus:ring-0'

const fieldStates: Record<FieldState, string> = {
  default: '',
  filled: 'bg-filled border-filled-border',
  edited: 'bg-edited border-edited-border ring-3 ring-ready-dot/12',
}

export default function CommonInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
  state = 'default',
  multiline = false,
  rows = 2,
  readOnly = false,
  fullWidth = false,
}: CommonInputProps) {
  const id = useId()
  const classes = cn(fieldBase, fieldStates[state], className)

  const onChangeHandler = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e)
    } else {
      console.log('Input value changed:', e.target.value)
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'col-span-full')}>
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={onChangeHandler}
          placeholder={placeholder}
          readOnly={readOnly}
          className={cn(classes, 'min-h-14 resize-none py-2 leading-normal')}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChangeHandler}
          placeholder={placeholder}
          readOnly={readOnly}
          className={cn(classes, 'h-[34px]')}
        />
      )}
    </div>
  )
}
