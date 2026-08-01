export default function Button({ variant = 'default', icon: Icon, children, className = '', ...props }) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={16} aria-hidden="true"/>}{children}</button>
}
