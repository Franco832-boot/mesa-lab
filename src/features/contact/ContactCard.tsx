import { useLocale } from '../../locales/useLocale';
import { contactMailto } from './contact';

const messages = {
  project: ['customProjectTitle', 'customProjectDescription', 'customProjectButton', 'customProjectSubject', 'customProjectBody'],
  module: ['requestModuleTitle', 'requestModuleDescription', 'requestModuleButton', 'requestModuleSubject', 'requestModuleBody'],
} as const;
export function ContactCard({ kind }: { kind: keyof typeof messages }) {
  const { t } = useLocale();
  const [title, description, button, subject, body] = messages[kind];
  return <article className="project-card contact-card" data-testid={`contact-${kind}`} aria-labelledby={`contact-${kind}-title`}>
    <h3 id={`contact-${kind}-title`}>{t(title)}</h3>
    <p>{t(description)}</p>
    <a className="secondary-button" href={contactMailto(t(subject), t(body))}>{t(button)}</a>
  </article>;
}
