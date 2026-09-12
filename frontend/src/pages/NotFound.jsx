import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="section" style={{ padding: '80px 0' }}>
      <div className="container" style={{ maxWidth: 520, textAlign: 'center' }}>
        <div style={{ fontSize: 64.5, fontWeight: 800, color: 'var(--blue)', letterSpacing: '-.05em', lineHeight: 1 }}>
          404
        </div>
        <h2 style={{ fontSize: 23, margin: '12px 0 10px' }}>Page not found</h2>
        <p style={{ fontSize: 14, marginBottom: 24 }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary">Back to home</Link>
          <Link to="/products" className="btn btn-outline">Browse products</Link>
        </div>
      </div>
    </section>
  );
}
