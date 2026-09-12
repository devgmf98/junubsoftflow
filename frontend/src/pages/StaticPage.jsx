import { Link } from 'react-router-dom';
import { date } from '../utils/format';

const PAGES = {
  terms: {
    title: 'Terms of Service',
    intro: 'These terms cover buying and using software purchased through SoftFlow.',
    sections: [
      ['Licences you buy', 'Every licence sold here is genuine and supplied by the publisher or an authorised distributor. The publisher terms apply to the software itself.'],
      ['Delivery', 'Licence keys are issued the moment payment is captured and appear under Licences in your account. Bank transfer orders are released once the funds clear.'],
      ['Refunds', 'Unused licence keys can be refunded within 14 days. Once a key has been activated it cannot be returned.'],
      ['Your account', 'You are responsible for keeping your sign-in details secure and for activity that happens under your account.'],
      ['Changes', 'If we change these terms materially, we will email account holders at least 30 days beforehand.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'What SoftFlow collects when you buy software, and what we do with it.',
    sections: [
      ['What we collect', 'Your name, email and phone number, the orders you place, and technical logs such as IP address and browser type.'],
      ['How we use it', 'To process orders, issue licence keys, provide support and - only if you opt in - send you offers.'],
      ['Payments', 'Card details are handled by our payment processor and are never stored on our servers.'],
      ['Sharing', 'We do not sell your data. Publishers receive only what is needed to register your licence.'],
      ['Your rights', 'You can access, correct, export or delete your data from your account, or by emailing support.'],
    ],
  },
  status: {
    title: 'System Status',
    intro: 'All SoftFlow services are operating normally.',
    sections: [
      ['Storefront', 'Operational - 99.98% uptime over the last 90 days.'],
      ['Checkout and payments', 'Operational - card, PayPal and mobile money all settling normally.'],
      ['Licence delivery', 'Operational - median delivery time under 30 seconds.'],
      ['Downloads', 'Operational - all installers and mobile builds available.'],
      ['Scheduled maintenance', 'None scheduled. Windows are announced at least 72 hours ahead.'],
    ],
  },
};

export default function StaticPage({ page }) {
  const content = PAGES[page];
  if (!content) return null;

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 28.5, marginBottom: 10 }}>{content.title}</h1>
        <p style={{ fontSize: 14.5, marginBottom: 30 }}>{content.intro}</p>

        {content.sections.map(([heading, body]) => (
          <div key={heading} style={{ padding: '18px 0', borderBottom: '1px solid var(--line-2)' }}>
            <h3 style={{ fontSize: 14.5, marginBottom: 7 }}>{heading}</h3>
            <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.7 }}>{body}</p>
          </div>
        ))}

        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 26 }}>
          Last updated {date(new Date())}. Questions? <Link to="/contact">Get in touch</Link>.
        </p>
      </div>
    </section>
  );
}
