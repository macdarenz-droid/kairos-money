import type {CSSProperties} from 'react';
import {Button} from './primitives';
import {THEMES, type ThemePreference} from './theme';

export function ThemeChoices({preference, choose}: {preference: ThemePreference; choose: (value: ThemePreference) => void}) {
  return <div className="theme-choices">
    <Button aria-pressed={preference === 'system'} onClick={() => choose('system')}>System</Button>
    {THEMES.map(theme => <Button key={theme.id} aria-pressed={preference === theme.id} onClick={() => choose(theme.id)}>
      <span className="theme-swatch" aria-hidden="true" style={{'--swatch-surface': theme.swatch.surface, '--swatch-ink': theme.swatch.ink, '--swatch-accent': theme.swatch.accent} as CSSProperties}/>
      {theme.label}
    </Button>)}
  </div>;
}
