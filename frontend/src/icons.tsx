import React from 'react';

export function IconPen(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l9.06-9.06.92.92-9.06 9.06ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" fill="currentColor"/>
    </svg>
  );
}

export function IconTrash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1.06l-1.17 12.05A3 3 0 0 1 14.79 23H9.21a3 3 0 0 1-2.98-2.95L5.06 7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1Zm1 2h4V4h-4v1Zm-2.9 2 1.06 11a1 1 0 0 0 1 .9h5.58a1 1 0 0 0 1-.9l1.06-11H7.1Z" fill="currentColor"/>
    </svg>
  );
}

export function IconLink(props: React.SVGProps<SVGSVGElement>) {
  // Chain link style
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M10.59 13.41a1 1 0 0 1 0-1.41l2.83-2.83a1 1 0 0 1 1.41 1.41l-2.83 2.83a1 1 0 0 1-1.41 0Zm-2.83 4.24a4 4 0 0 1 0-5.66l2.12-2.12a4 4 0 0 1 5.66 0 1 1 0 1 1-1.41 1.41 2 2 0 0 0-2.83 0l-2.12 2.12a2 2 0 0 0 2.83 2.83l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a4 4 0 0 1-5.66 0Zm8.48-8.48a4 4 0 0 1 0 5.66l-1.41 1.41a1 1 0 1 1-1.41-1.41l1.41-1.41a2 2 0 1 0-2.83-2.83l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a4 4 0 0 1 5.66 0Z" fill="currentColor"/>
    </svg>
  );
}

export function IconShare(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 8a3 3 0 1 0-2.82-4H12a3 3 0 0 0 .18 1.03L7.4 8.2a3 3 0 0 0-1.9-.68A3.5 3.5 0 1 0 9 11.5c0-.18-.02-.35-.05-.52l4.9-3.17c.32.12.66.19 1.02.19ZM5.5 14A1.5 1.5 0 1 1 7 12.5 1.5 1.5 0 0 1 5.5 14Zm13 2a3 3 0 1 0-2.82-2H15a3 3 0 0 0 .18 1.03l-5.06 3.27a3 3 0 0 0-1.88-.66A3.5 3.5 0 1 0 11 21.5c0-.18-.02-.35-.05-.52l5.02-3.24c.31.16.66.26 1.03.26Z" fill="currentColor"/>
    </svg>
  );
}

export function IconChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M6.7 9.3a1 1 0 0 1 1.4 0L12 13.17l3.9-3.87a1 1 0 0 1 1.4 1.42l-4.6 4.56a1 1 0 0 1-1.4 0L6.7 10.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
    </svg>
  );
}

export function IconPaperclip(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8.5 19.5a4.5 4.5 0 0 1 0-6.36l6.72-6.72a3.5 3.5 0 1 1 4.95 4.95l-7.07 7.07a2.5 2.5 0 1 1-3.54-3.54l6.01-6.01a1 1 0 1 1 1.41 1.41l-6.01 6.01a0.5 0.5 0 1 0 .71.71l7.07-7.07a1.5 1.5 0 1 0-2.12-2.12L9.91 12.1a2.5 2.5 0 0 0 3.54 3.54l5.3-5.3a1 1 0 1 1 1.41 1.41l-5.3 5.3a4.5 4.5 0 0 1-6.36 0Z" fill="currentColor" />
    </svg>
  );
}

export function IconLinkAlt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <img src="/icons/link-alt.svg" alt="link" {...(props as any)} />
  );
}


