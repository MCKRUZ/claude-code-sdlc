// The wordmark is the word "Tōgō" set in the UI's own Inter at weight 650 with real macrons —
// never a letter-spaced all-caps treatment, a display serif or a logotype (brand §5 "do not").
// It is plain text so it is read, searched and translated like any other word on the screen;
// `lang` is left as the document's (English) because the romanisation IS the English name.
import type { HTMLAttributes } from 'react'
import { cn } from '../../ui'

export const PRODUCT_NAME = 'Tōgō'

/** The spoken name and its meaning, for the one place that explains it (the Welcome tagline). */
export const PRODUCT_PRONUNCIATION = 'TOH-goh'
export const PRODUCT_KANJI = '統合'

export interface TogoWordmarkProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {}

/** Weight and tracking follow the brand; the caller sets size and colour, since the wordmark
 * appears at 12 px in window chrome and 28 px in the Welcome hero. */
export function TogoWordmark({ className, ...rest }: TogoWordmarkProps) {
  return (
    <span className={cn('font-semibold tracking-[-0.01em]', className)} {...rest}>
      {PRODUCT_NAME}
    </span>
  )
}
