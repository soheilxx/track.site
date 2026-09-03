/**
 * Applies the stored theme before first paint so there is no flash of the wrong theme. Rendered in
 * `<head>` by every root layout. The script is a fixed literal: it reads one localStorage key and
 * never inlines user data.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('ts-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
