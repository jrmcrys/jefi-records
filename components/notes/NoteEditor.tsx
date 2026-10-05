"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import Modal from "../Modal";
import { HIGHLIGHT_COLORS } from "../RichEditor";
import { toEmbed } from "@/lib/notes";
import { uploadNoteFile } from "@/lib/noteFiles";
import {
  Audio,
  Callout,
  Embed,
  FileAttachment,
  NoteImage,
  SlashCommand,
  type SlashAction,
} from "./extensions";

export const TEXT_COLORS = [
  { name: "Default", value: "" },
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#9333ea" },
  { name: "Pink", value: "#db2777" },
];

function Tool({
  label,
  active,
  onClick,
  children,
  wide,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 ${wide ? "px-2" : "w-8"} shrink-0 items-center justify-center rounded text-sm hover:bg-current/10 ${
        active ? "bg-accent/20 font-semibold" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-current/15" />;
}

function Toolbar({ editor, onAction }: { editor: Editor; onAction: (a: SlashAction) => void }) {
  const [panel, setPanel] = useState<"none" | "color" | "link">("none");
  const [url, setUrl] = useState("");
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      table: e.isActive("table"),
    }),
  });

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 overflow-x-auto px-1 py-1">
        <Tool label="Bold" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>B</b>
        </Tool>
        <Tool label="Italic" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </Tool>
        <Tool label="Underline" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </Tool>
        <Tool label="Strikethrough" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </Tool>
        <Tool label="Text and highlight color" active={panel === "color"} onClick={() => setPanel(panel === "color" ? "none" : "color")}>
          <span className="rounded px-0.5" style={{ background: "#fde68a", color: "#111" }}>
            A
          </span>
        </Tool>
        <Tool
          label="Link"
          active={s.link}
          onClick={() => {
            setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
            setPanel(panel === "link" ? "none" : "link");
          }}
        >
          🔗
        </Tool>
        <Sep />
        <Tool label="Heading 1" active={s.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Tool>
        <Tool label="Heading 2" active={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Tool>
        <Tool label="Heading 3" active={s.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Tool>
        <Sep />
        <Tool label="Bulleted list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          •
        </Tool>
        <Tool label="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1.
        </Tool>
        <Tool label="Checklist" active={s.task} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          ☑
        </Tool>
        <Tool label="Toggle" onClick={() => editor.chain().focus().setDetails().run()}>
          ▸
        </Tool>
        <Sep />
        <Tool label="Align left" active={s.left} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          ⇤
        </Tool>
        <Tool label="Align center" active={s.center} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          ↔
        </Tool>
        <Tool label="Align right" active={s.right} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          ⇥
        </Tool>
        <Sep />
        <Tool label="Quote" active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝
        </Tool>
        <Tool label="Code block" active={s.code} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          {"</>"}
        </Tool>
        <Tool
          label="Callout"
          onClick={() => editor.chain().focus().insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run()}
        >
          💡
        </Tool>
        <Tool label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          —
        </Tool>
        <Tool
          label="Table"
          active={s.table}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          ▦
        </Tool>
        <Sep />
        <Tool label="Picture" onClick={() => onAction("image")}>
          🖼
        </Tool>
        <Tool label="Embed a link" onClick={() => onAction("embed")}>
          ▶
        </Tool>
        <Tool label="Audio" onClick={() => onAction("audio")}>
          ♪
        </Tool>
        <Tool label="Attach a file" onClick={() => onAction("file")}>
          📎
        </Tool>
      </div>

      {s.table && (
        <div className="flex flex-wrap items-center gap-1 border-t border-current/10 px-2 py-1 text-xs">
          <span className="opacity-60">Table:</span>
          {(
            [
              ["Row above", () => editor.chain().focus().addRowBefore().run()],
              ["Row below", () => editor.chain().focus().addRowAfter().run()],
              ["Column left", () => editor.chain().focus().addColumnBefore().run()],
              ["Column right", () => editor.chain().focus().addColumnAfter().run()],
              ["Delete row", () => editor.chain().focus().deleteRow().run()],
              ["Delete column", () => editor.chain().focus().deleteColumn().run()],
              ["Header row", () => editor.chain().focus().toggleHeaderRow().run()],
              ["Delete table", () => editor.chain().focus().deleteTable().run()],
            ] as const
          ).map(([label, fn]) => (
            <button key={label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={fn} className="rounded px-1.5 py-0.5 hover:bg-current/10">
              {label}
            </button>
          ))}
        </div>
      )}

      {panel === "color" && (
        <div className="absolute left-2 top-full z-20 mt-1 w-64 rounded-lg border border-current/20 bg-background p-3 shadow-xl">
          <p className="text-xs opacity-60">Text color</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={`Text ${c.name}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                  setPanel("none");
                }}
                className="flex size-7 items-center justify-center rounded border border-current/15 text-sm font-semibold"
                style={{ color: c.value || undefined }}
              >
                A
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs opacity-60">Highlight</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={`Highlight ${c.name}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().toggleHighlight({ color: c.value }).run();
                  setPanel("none");
                }}
                className="size-7 rounded border border-current/15"
                style={{ background: c.value }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setPanel("none");
              }}
              className="rounded border border-current/15 px-2 text-xs"
            >
              None
            </button>
          </div>
        </div>
      )}

      {panel === "link" && (
        <form
          className="absolute left-2 top-full z-20 mt-1 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-current/20 bg-background p-2 shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            const t = url.trim();
            if (!t) editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: /^(https?:|mailto:)/i.test(t) ? t : `https://${t}` })
                .run();
            setPanel("none");
          }}
        >
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            aria-label="Link address"
            className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm outline-none"
          />
          <button type="submit" className="rounded-md bg-accent px-3 py-1 text-sm text-white">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

/* The editor for one note. Saves through onChange; the parent debounces. */
export default function NoteEditor({
  noteId,
  content,
  contentVersion,
  editable,
  onChange,
  onEditor,
}: {
  noteId: string;
  content: JSONContent;
  /** Bump this to load new content from outside (for example the other person's edit). */
  contentVersion: number;
  editable: boolean;
  onChange: (json: JSONContent, text: string) => void;
  onEditor?: (editor: Editor | null) => void;
}) {
  const [dialog, setDialog] = useState<SlashAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<(a: SlashAction) => void>(() => {});
  const filesRef = useRef<(files: File[]) => void>(() => {});
  /* Changes only count once the person has touched the note. The editor
     tidies freshly loaded content (for example adding an empty line at the
     end), and that must not count as an edit. */
  const touched = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
      Details.configure({ persist: true, HTMLAttributes: { class: "note-details" } }),
      DetailsSummary,
      DetailsContent,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Type / for blocks, or just start writing"),
        includeChildren: false,
      }),
      Callout,
      Embed,
      Audio,
      FileAttachment,
      NoteImage,
      // The ref is only read when a "/" item is chosen, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      SlashCommand.configure({ onAction: (a: SlashAction) => actionRef.current(a) }),
    ],
    []
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content,
    editable,
    editorProps: {
      attributes: { class: "note-content", "aria-label": "Note" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        filesRef.current(files);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        filesRef.current(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!touched.current) return;
      onChangeRef.current(e.getJSON(), e.getText({ blockSeparator: "\n" }));
    },
  });

  useEffect(() => {
    onEditor?.(editor ?? null);
  }, [editor, onEditor]);

  /* Load content from outside without firing onChange. */
  const lastVersion = useRef(contentVersion);
  useEffect(() => {
    if (!editor || lastVersion.current === contentVersion) return;
    lastVersion.current = contentVersion;
    touched.current = false;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content, contentVersion]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  async function insertFiles(files: File[]) {
    if (!editor) return;
    touched.current = true;
    setBusy(true);
    setError(null);
    try {
      for (const f of files) {
        const { path, name } = await uploadNoteFile(noteId, f);
        if (f.type.startsWith("image/")) {
          editor.chain().focus().insertContent({ type: "image", attrs: { path, alt: name } }).run();
        } else if (f.type.startsWith("audio/")) {
          editor.chain().focus().insertContent({ type: "audio", attrs: { path, name } }).run();
        } else {
          editor.chain().focus().insertContent({ type: "fileAttachment", attrs: { path, name, size: f.size } }).run();
        }
      }
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    filesRef.current = (files: File[]) => void insertFiles(files);
    actionRef.current = (a: SlashAction) => {
      setError(null);
      setLink("");
      setDialog(a);
    };
  });

  function insertLink(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    touched.current = true;
    const t = link.trim();
    if (dialog === "image") {
      if (!/^https:\/\//i.test(t)) {
        setError("Paste a picture link that starts with https://");
        return;
      }
      editor.chain().focus().insertContent({ type: "image", attrs: { src: t } }).run();
      setDialog(null);
      return;
    }
    const info = toEmbed(t);
    if (!info) {
      setError("Paste a full link that starts with https://");
      return;
    }
    editor.chain().focus().insertContent({ type: "embed", attrs: { src: info.src, url: t, provider: info.provider, height: info.height } }).run();
    setDialog(null);
  }

  const accept = dialog === "image" ? "image/*" : dialog === "audio" ? "audio/*" : undefined;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onPointerDownCapture={() => {
        touched.current = true;
      }}
      onKeyDownCapture={() => {
        touched.current = true;
      }}
    >
      {editor && editable && (
        <div className="sticky top-0 z-10 border-b border-current/10 bg-background">
          <Toolbar editor={editor} onAction={(a) => actionRef.current(a)} />
        </div>
      )}
      {busy && <p className="px-4 py-1 text-xs opacity-60">Uploading...</p>}
      <EditorContent editor={editor} className="min-h-0 flex-1" />

      {dialog && (
        <Modal
          title={
            dialog === "image" ? "Add a picture" : dialog === "embed" ? "Embed a link" : dialog === "audio" ? "Add audio" : "Attach a file"
          }
          description={
            dialog === "embed"
              ? "YouTube, Vimeo, Google Docs, Sheets, Slides and Forms, Spotify, SoundCloud, Loom, Figma, Canva, Google Maps and Calendar, Calendly, Cal.com, PDFs, or any web page."
              : undefined
          }
          onClose={() => setDialog(null)}
        >
          <div className="mt-4 space-y-3">
            {dialog !== "embed" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
                >
                  {busy ? "Uploading..." : dialog === "image" ? "Upload a picture" : dialog === "audio" ? "Upload an MP3 or other audio" : "Choose a file"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={accept}
                  multiple={dialog !== "audio"}
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) void insertFiles(files);
                  }}
                />
                <p className="text-xs opacity-60">Up to 25 MB each. Only people who can see this note can open it.</p>
              </>
            )}
            {(dialog === "embed" || dialog === "image") && (
              <form onSubmit={insertLink} className="flex gap-2">
                <input
                  autoFocus={dialog === "embed"}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder={dialog === "image" ? "Or paste a picture link" : "https://..."}
                  aria-label="Link"
                  className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
                />
                <button type="submit" disabled={!link.trim()} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Insert
                </button>
              </form>
            )}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
