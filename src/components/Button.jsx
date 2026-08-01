import { forwardRef } from 'react'

const Button = forwardRef(function Button({ variant = 'default', icon: Icon, children, className = '', ...props }, ref) {
  return <button ref={ref} type="button" className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={16} aria-hidden="true"/>}{children}</button>
})

export default Button
