import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmailHtml, renderEmailText } from '../emailTemplate.js';

describe('escapeHtml', () => {
  it('escapes all five special characters', () => {
    expect(escapeHtml(`<script>alert('x')&"y"</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;y&quot;&lt;/script&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Acme Corp, a normal business name')).toBe(
      'Acme Corp, a normal business name',
    );
  });
});

describe('renderEmailHtml', () => {
  const baseInput = {
    greetingName: 'Jane',
    paragraphs: ['First paragraph.', 'Second paragraph.'],
    unsubscribeUrl: 'https://example.com/unsubscribe/lead-1/token',
  };

  it('always includes the signature block and a working opt-out link', () => {
    const html = renderEmailHtml(baseInput);
    expect(html).toContain('Digital Solutions');
    expect(html).toContain('info@bebeyond.digital');
    expect(html).toContain('+91 99 1867 1867');
    expect(html).toContain(`href="${baseInput.unsubscribeUrl}"`);
  });

  it('presents the opt-out as a natural inline sentence, not a styled "Unsubscribe" button/footer', () => {
    const html = renderEmailHtml(baseInput);
    expect(html).toContain("rather not hear from us");
    expect(html).not.toContain('>Unsubscribe<');
    expect(html).not.toContain("You're receiving this because");
  });

  it('uses minimal markup — no table layout, no background-color, no brand-colored logo/CTA styling', () => {
    const html = renderEmailHtml(baseInput);
    expect(html).not.toContain('<table');
    expect(html).not.toContain('background-color');
    expect(html).not.toContain('#FB8500'); // brand orange
    expect(html).not.toContain('#219EBC'); // brand teal
  });

  it('includes a clickable, unescaped link to the company website in the signature block', () => {
    const html = renderEmailHtml(baseInput);
    expect(html).toContain('<a href="https://www.bebeyond.digital/">www.bebeyond.digital</a>');
  });

  it('includes every paragraph', () => {
    const html = renderEmailHtml(baseInput);
    expect(html).toContain('First paragraph.');
    expect(html).toContain('Second paragraph.');
  });

  it('HTML-escapes lead-controlled and AI-generated text (ingested data is untrusted)', () => {
    const html = renderEmailHtml({
      ...baseInput,
      greetingName: '<img src=x onerror=alert(1)>',
      paragraphs: ['Check out <b>this</b> & "that"'],
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<b>this</b>');
  });

  it('still includes the signature/unsubscribe footer even with adversarial input', () => {
    const html = renderEmailHtml({
      ...baseInput,
      paragraphs: ['</body></html><script>alert(1)</script>'],
    });
    expect(html).toContain('info@bebeyond.digital');
    expect(html).toContain(baseInput.unsubscribeUrl);
  });
});

describe('renderEmailText', () => {
  it('includes paragraphs, signature, and a natural-language opt-out line with the working URL', () => {
    const text = renderEmailText({
      greetingName: 'Jane',
      paragraphs: ['Hello there.'],
      unsubscribeUrl: 'https://example.com/unsubscribe/lead-1/token',
    });
    expect(text).toContain('Hi Jane,');
    expect(text).toContain('Hello there.');
    expect(text).toContain('BeBeyond Digital Solutions');
    expect(text).toContain('info@bebeyond.digital');
    expect(text).toContain('rather not hear from us');
    expect(text).toContain('https://example.com/unsubscribe/lead-1/token');
    expect(text).not.toContain('Unsubscribe:');
    expect(text).toContain('https://www.bebeyond.digital/');
  });
});
