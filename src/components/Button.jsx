export default function Button({ variant = 'default', icon: Icon, children, className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={16}/>} {children}</button>
}
