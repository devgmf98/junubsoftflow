import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import usePageMeta from '../hooks/usePageMeta';

const TOPICS = [
  'A question before I buy',
  'An existing order',
  'Licence keys or activation',
  'Downloads or installers',
  'Refund or cancellation',
  'Something else',
];

const FAQS = [
  [
    'How fast do licence keys arrive?',
    'Immediately. Card, PayPal and mobile money orders issue keys the moment payment clears. Bank transfer and cash orders stay pending until we confirm the payment, then release the keys automatically.',
  ],
  [
    'Can I re-download an installer later?',
    'Yes. Everything you have bought sits under Downloads in your account for as long as the licence is valid, so a lost email never costs you a licence.',
  ],
  [
    'What if a key does not work?',
    'Send us the order number and we will replace it. Keys come from the publisher or an authorised distributor, so a failed activation is something we can fix rather than argue about.',
  ],
  [
    'Do you refund unused licences?',
    'An unused key can be refunded within fourteen days. If it has already been activated we will tell you honestly whether the publisher allows a return.',
  ],
];

export default function Contact() {
  usePageMeta({
    title: 'Contact support',
    description:
      'Questions about a licence, an order or a refund? The people who run the store answer the tickets, and we reply within one business day.',
    path: '/contact',
  });

  const toast = useToast();
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({ name: '', email: '', subject: TOPICS[0], message: '' });
  const [busy, setBusy] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    api.get('/shop/settings').then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/shop/contact', form);
      toast.ok('Thanks for getting in touch. Our team will reply within one business day.');
      setForm({ name: '', email: '', subject: TOPICS[0], message: '' });
    } catch (err) {
      toast.fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  const email = settings.support_email || 'support@softflow.com';
  const phone = settings.support_phone || '+211 920 000 111';
  const office = settings.office_address || 'Juba, South Sudan';

  const channels = [
    ['mail', 'blue', 'Email us', email, `mailto:${email}`, 'Replies within one business day'],
    ['phone', 'green', 'Call us', phone, `tel:${phone.replace(/\s+/g, '')}`, 'Mon to Fri, 9am - 5pm'],
    ['box', 'purple', 'Visit us', office, null, 'Collection and cash payment'],
  ];

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="about-hero contact-hero">
        <div className="container">
          <div className="about-hero-inner">
            <span className="about-eyebrow" data-reveal="fade">
              <Icon name="headset" /> Support
            </span>
            <h1 data-reveal style={{ '--d': '60ms' }}>Talk to a person, not a queue</h1>
            <p className="about-lead" data-reveal style={{ '--d': '140ms' }}>
              Questions about a licence, an order or a refund? The people who run the store answer
              the tickets, and we reply within one business day.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- how to reach us ---------- */}
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="container">
          <div className="contact-channels">
            {channels.map(([icon, accent, label, value, href, note], i) => {
              const Tag = href ? 'a' : 'div';
              return (
                <Tag
                  key={label}
                  {...(href ? { href } : {})}
                  className="contact-channel"
                  data-reveal
                  style={{ '--d': `${i * 90}ms` }}
                >
                  <span className={`kpi-ic ic-${accent}`}><Icon name={icon} /></span>
                  <span className="contact-channel-label">{label}</span>
                  <span className="contact-channel-value">{value}</span>
                  <span className="contact-channel-note">{note}</span>
                </Tag>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- form + reassurance ---------- */}
      <section className="section">
        <div className="container">
          <div className="contact-layout">
            <div className="panel contact-form-panel" style={{ margin: 0 }}>
              <div className="panel-head">
                <h3>Send us a message</h3>
                <div className="right cell-sub">We answer every one</div>
              </div>
              <div className="panel-body">
                <form onSubmit={submit}>
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="c-name">Your name</label>
                      <input id="c-name" value={form.name} onChange={set('name')} placeholder="Jane Doe" required />
                    </div>
                    <div className="field">
                      <label htmlFor="c-email">Email</label>
                      <input
                        id="c-email"
                        type="email"
                        value={form.email}
                        onChange={set('email')}
                        placeholder="you@company.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="c-subject">What is this about?</label>
                    <select id="c-subject" value={form.subject} onChange={set('subject')}>
                      {TOPICS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="c-message">Message</label>
                    <textarea
                      id="c-message"
                      value={form.message}
                      onChange={set('message')}
                      placeholder="Tell us what you need. An order number helps us answer in one reply."
                      rows={6}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
                    {busy ? 'Sending...' : (<><Icon name="mail" /> Send message</>)}
                  </button>

                  <p className="contact-privacy">
                    <Icon name="lock" /> We only use your details to answer this message.
                  </p>
                </form>
              </div>
            </div>

            <aside className="contact-side">
              <div className="contact-promise" data-reveal="right">
                <span className="kpi-ic ic-blue"><Icon name="clock" /></span>
                <div>
                  <b>One business day</b>
                  <p>That is the reply time we hold ourselves to, not a best case.</p>
                </div>
              </div>

              <div className="contact-promise" data-reveal="right" style={{ '--d': '90ms' }}>
                <span className="kpi-ic ic-green"><Icon name="key" /></span>
                <div>
                  <b>Already bought something?</b>
                  <p>
                    Your keys and installers are under{' '}
                    <Link to="/account/licenses">Delivery &amp; Licences</Link> - no need to wait for us.
                  </p>
                </div>
              </div>

              <div className="contact-promise" data-reveal="right" style={{ '--d': '180ms' }}>
                <span className="kpi-ic ic-orange"><Icon name="monitor" /></span>
                <div>
                  <b>Prefer to look first?</b>
                  <p>
                    Try before you buy on the <Link to="/demos">live demos</Link>, or browse the{' '}
                    <Link to="/products">catalogue</Link>.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section className="section section-soft">
        <div className="container" style={{ maxWidth: 820 }}>
          <div className="section-head section-head-center" data-reveal>
            <h2>Before you write</h2>
            <p>These four come up most often - the answer might already be here.</p>
          </div>

          <div className="faq">
            {FAQS.map(([q, a], i) => (
              <div
                className={`faq-item ${openFaq === i ? 'on' : ''}`}
                key={q}
                data-reveal
                style={{ '--d': `${i * 80}ms` }}
              >
                <button
                  type="button"
                  className="faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{q}</span>
                  <Icon name="chevronDown" />
                </button>
                {openFaq === i && <p className="faq-a">{a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
