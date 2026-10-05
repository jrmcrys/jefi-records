"use client";

/* eslint-disable @next/next/no-img-element */

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  Extension,
  Node,
  mergeAttributes,
  type Editor,
  type Range,
} from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  ReactRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import Image from "@tiptap/extension-image";
import { noteFileUrl } from "@/lib/noteFiles";

/* ------------------------------------------------------------------ */
/* Callout: a tinted box with an emoji.                                */

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const emojis = ["💡", "📌", "⚠️", "✅", "❗", "🔥", "📝", "❤️"];
  const current = (node.attrs.emoji as string) || "💡";
  return (
    <NodeViewWrapper className="note-callout" data-color={node.attrs.color}>
      <button
        type="button"
        contentEditable={false}
        disabled={!editor.isEditable}
        aria-label="Change the callout emoji"
        onClick={() => {
          const i = emojis.indexOf(current);
          updateAttributes({ emoji: emojis[(i + 1) % emojis.length] });
        }}
        className="note-callout-emoji"
      >
        {current}
      </button>
      <NodeViewContent className="note-callout-body" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return {
      emoji: { default: "💡" },
      color: { default: "yellow" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

/* ------------------------------------------------------------------ */
/* Embed: a video, song, Google file, map or web page in a frame.       */

function EmbedView({ node, selected, updateAttributes, editor }: NodeViewProps) {
  const src = node.attrs.src as string;
  const url = (node.attrs.url as string) || src;
  const height = (node.attrs.height as number) || 400;
  const provider = node.attrs.provider as string;
  return (
    <NodeViewWrapper className={`note-embed ${selected ? "is-selected" : ""}`} data-drag-handle="">
      <iframe
        src={src}
        title={provider || "Embedded page"}
        style={{ height }}
        loading="lazy"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="note-embed-bar" contentEditable={false}>
        <span className="truncate">{provider}</span>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open
        </a>
        {editor.isEditable && (
          <>
            <button type="button" onClick={() => updateAttributes({ height: Math.max(120, height - 80) })} aria-label="Shorter">
              Shorter
            </button>
            <button type="button" onClick={() => updateAttributes({ height: Math.min(1200, height + 80) })} aria-label="Taller">
              Taller
            </button>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      url: { default: "" },
      provider: { default: "" },
      height: { default: 400 },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-embed]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-embed": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },
});

/* ------------------------------------------------------------------ */
/* Files stored with the note (private bucket, signed address).        */

function useSigned(path: string | null, fallback: string | null) {
  const [url, setUrl] = useState<string | null>(path ? null : fallback);
  useEffect(() => {
    if (!path) return;
    let live = true;
    void noteFileUrl(path).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [path]);
  return path ? url : fallback;
}

function AudioView({ node, selected }: NodeViewProps) {
  const url = useSigned(node.attrs.path as string | null, node.attrs.src as string | null);
  return (
    <NodeViewWrapper className={`note-file ${selected ? "is-selected" : ""}`} data-drag-handle="">
      <p className="note-file-name">{(node.attrs.name as string) || "Audio"}</p>
      {url ? <audio controls preload="metadata" src={url} className="w-full" /> : <p className="text-xs opacity-60">Loading...</p>}
    </NodeViewWrapper>
  );
}

export const Audio = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { path: { default: null }, src: { default: null }, name: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-audio]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-audio": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AudioView);
  },
});

function FileView({ node, selected }: NodeViewProps) {
  const url = useSigned(node.attrs.path as string | null, null);
  const name = (node.attrs.name as string) || "File";
  const size = node.attrs.size as number | null;
  return (
    <NodeViewWrapper className={`note-attachment ${selected ? "is-selected" : ""}`} data-drag-handle="">
      <span aria-hidden="true">📎</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" download={name}>
          {name}
        </a>
      ) : (
        <span>{name}</span>
      )}
      {size ? <span className="opacity-60">{(size / 1024 / 1024).toFixed(1)} MB</span> : null}
    </NodeViewWrapper>
  );
}

export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { path: { default: null }, name: { default: "" }, size: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-file]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-file": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileView);
  },
});

function ImageView({ node, selected }: NodeViewProps) {
  const url = useSigned(node.attrs.path as string | null, node.attrs.src as string | null);
  return (
    <NodeViewWrapper className={`note-image ${selected ? "is-selected" : ""}`} data-drag-handle="">
      {url ? <img src={url} alt={(node.attrs.alt as string) || ""} /> : <div className="note-image-loading">Loading picture...</div>}
    </NodeViewWrapper>
  );
}

/* Pictures can be a link (src) or a file stored with the note (path). */
export const NoteImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      path: { default: null },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ inline: false, allowBase64: false });

/* ------------------------------------------------------------------ */
/* The "/" menu.                                                       */

export type SlashAction = "image" | "embed" | "audio" | "file";

export type SlashItem = {
  title: string;
  hint: string;
  keywords: string;
  icon: string;
  run: (editor: Editor, range: Range, onAction: (a: SlashAction) => void) => void;
};

export const SLASH_ITEMS: SlashItem[] = [
  { title: "Text", hint: "Plain paragraph", keywords: "paragraph p", icon: "¶", run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: "Heading 1", hint: "Big section title", keywords: "h1 title", icon: "H1", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: "Heading 2", hint: "Medium title", keywords: "h2 subtitle", icon: "H2", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: "Heading 3", hint: "Small title", keywords: "h3", icon: "H3", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: "Bulleted list", hint: "Simple list", keywords: "ul bullet unordered", icon: "•", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered list", hint: "1, 2, 3", keywords: "ol ordered number", icon: "1.", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "Checklist", hint: "Tick items off", keywords: "todo task check", icon: "☑", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Toggle", hint: "Dropdown that hides its content", keywords: "details collapse dropdown accordion", icon: "▸", run: (e, r) => e.chain().focus().deleteRange(r).setDetails().run() },
  {
    title: "Table",
    hint: "Rows and columns",
    keywords: "grid",
    icon: "▦",
    run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Callout",
    hint: "Box that stands out",
    keywords: "note info warning box",
    icon: "💡",
    run: (e, r) =>
      e.chain().focus().deleteRange(r).insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run(),
  },
  { title: "Quote", hint: "Quoted text", keywords: "blockquote", icon: "❝", run: (e, r) => e.chain().focus().deleteRange(r).setBlockquote().run() },
  { title: "Code", hint: "Code block", keywords: "pre monospace", icon: "</>", run: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run() },
  { title: "Divider", hint: "Line across", keywords: "hr rule line separator", icon: "—", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { title: "Picture", hint: "Upload or link", keywords: "image photo img", icon: "🖼", run: (e, r, a) => { e.chain().focus().deleteRange(r).run(); a("image"); } },
  {
    title: "Embed",
    hint: "YouTube, Docs, Spotify, maps, PDFs, sites",
    keywords: "video vimeo youtube google doc sheet slides form spotify soundcloud loom figma canva map calendar pdf website iframe calendly",
    icon: "▶",
    run: (e, r, a) => { e.chain().focus().deleteRange(r).run(); a("embed"); },
  },
  { title: "Audio", hint: "Upload an MP3", keywords: "mp3 sound music voice", icon: "♪", run: (e, r, a) => { e.chain().focus().deleteRange(r).run(); a("audio"); } },
  { title: "File", hint: "Attach any file", keywords: "attachment upload pdf", icon: "📎", run: (e, r, a) => { e.chain().focus().deleteRange(r).run(); a("file"); } },
];

type ListRef = { onKeyDown: (p: SuggestionKeyDownProps) => boolean };

const SlashList = forwardRef<ListRef, { items: SlashItem[]; command: (item: SlashItem) => void }>(
  function SlashList({ items, command }, ref) {
    const [index, setIndex] = useState(0);
    const [lastItems, setLastItems] = useState(items);
    if (lastItems !== items) {
      setLastItems(items);
      setIndex(0);
    }
    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          setIndex((i) => (i + 1) % Math.max(1, items.length));
          return true;
        }
        if (event.key === "ArrowUp") {
          setIndex((i) => (i - 1 + items.length) % Math.max(1, items.length));
          return true;
        }
        if (event.key === "Enter") {
          if (items[index]) command(items[index]);
          return true;
        }
        return false;
      },
    }));
    return (
      <div className="slash-menu" role="listbox" aria-label="Insert a block">
        {items.length === 0 ? (
          <p className="px-3 py-2 text-sm opacity-60">Nothing matches</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.title}
              type="button"
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command(item)}
              className={i === index ? "is-active" : ""}
            >
              <span className="slash-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{item.title}</span>
                <span className="block truncate text-xs opacity-60">{item.hint}</span>
              </span>
            </button>
          ))
        )}
      </div>
    );
  }
);

export const SlashCommand = Extension.create<{ onAction: (a: SlashAction) => void }>({
  name: "slashCommand",
  addOptions() {
    return { onAction: () => {} };
  },
  addProseMirrorPlugins() {
    const onAction = (a: SlashAction) => this.options.onAction(a);
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || i.keywords.includes(q)).slice(0, 12);
        },
        command: ({ editor, range, props }) => props.run(editor, range, onAction),
        render: () => {
          let renderer: ReactRenderer<ListRef> | null = null;
          const place = (p: SuggestionProps<SlashItem, SlashItem>) => {
            const rect = p.clientRect?.();
            if (!rect || !renderer) return;
            const el = renderer.element as HTMLElement;
            el.style.position = "fixed";
            el.style.zIndex = "95";
            const top = rect.bottom + 6;
            const fitsBelow = top + 320 < window.innerHeight;
            el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
            el.style.top = fitsBelow ? `${top}px` : "";
            el.style.bottom = fitsBelow ? "" : `${window.innerHeight - rect.top + 6}px`;
          };
          return {
            onStart: (p) => {
              renderer = new ReactRenderer(SlashList, {
                editor: p.editor,
                props: { items: p.items, command: p.command },
              });
              document.body.appendChild(renderer.element);
              place(p);
            },
            onUpdate: (p) => {
              renderer?.updateProps({ items: p.items, command: p.command });
              place(p);
            },
            onKeyDown: (p) => {
              if (p.event.key === "Escape") {
                renderer?.destroy();
                renderer?.element.remove();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(p) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
