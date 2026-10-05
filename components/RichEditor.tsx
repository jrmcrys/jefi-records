"use client";

import { useEffect, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import type { Profile } from "@/lib/types";

export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#fde68a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Purple", value: "#e9d5ff" },
];

function extensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({ placeholder }),
    Mention.configure({
      HTMLAttributes: { class: "mention" },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    }),
  ];
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded text-sm hover:bg-current/10 ${
        active ? "bg-accent/20 font-semibold" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  people,
}: {
  editor: Editor;
  people?: Profile[];
}) {
  const [panel, setPanel] = useState<"none" | "highlight" | "link" | "mention">(
    "none"
  );
  const [url, setUrl] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor.isActive("bold"),
      italic: ctx.editor.isActive("italic"),
      underline: ctx.editor.isActive("underline"),
      highlight: ctx.editor.isActive("highlight"),
      link: ctx.editor.isActive("link"),
      bullet: ctx.editor.isActive("bulletList"),
      ordered: ctx.editor.isActive("orderedList"),
    }),
  });

  useEffect(() => {
    if (panel === "none") return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPanel("none");
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [panel]);

  function openLink() {
    const current = editor.getAttributes("link").href as string | undefined;
    setUrl(current ?? "");
    setPanel("link");
  }

  function applyLink() {
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^(https?:|mailto:)/i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setPanel("none");
  }

  return (
    <div ref={rootRef} className="relative flex flex-wrap items-center gap-0.5 border-b border-current/10 px-1.5 py-1">
      <ToolButton
        label="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolButton>
      <ToolButton
        label="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolButton>
      <ToolButton
        label="Underline"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolButton>
      <ToolButton
        label="Highlight color"
        active={state.highlight || panel === "highlight"}
        onClick={() => setPanel(panel === "highlight" ? "none" : "highlight")}
      >
        <span
          className="rounded px-1 text-xs font-semibold"
          style={{ backgroundColor: "#fde68a", color: "#171717" }}
        >
          H
        </span>
      </ToolButton>
      <ToolButton
        label="Link"
        active={state.link || panel === "link"}
        onClick={() => (panel === "link" ? setPanel("none") : openLink())}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M6.5 9.5l3-3" />
          <path d="M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1" />
          <path d="M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
        </svg>
      </ToolButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-current/15" />
      <ToolButton
        label="Bulleted list"
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="4" r="1.2" />
          <circle cx="3" cy="8" r="1.2" />
          <circle cx="3" cy="12" r="1.2" />
          <rect x="6" y="3.2" width="8" height="1.6" rx=".8" />
          <rect x="6" y="7.2" width="8" height="1.6" rx=".8" />
          <rect x="6" y="11.2" width="8" height="1.6" rx=".8" />
        </svg>
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <span className="text-xs font-semibold">1.</span>
      </ToolButton>
      {people && people.length > 0 && (
        <ToolButton
          label="Mention someone"
          active={panel === "mention"}
          onClick={() => setPanel(panel === "mention" ? "none" : "mention")}
        >
          <span className="font-semibold">@</span>
        </ToolButton>
      )}

      {panel === "highlight" && (
        <div className="absolute left-2 top-full z-20 mt-1 flex items-center gap-1.5 rounded-md border border-current/20 bg-background p-2 shadow-lg">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={`Highlight ${c.name}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().setHighlight({ color: c.value }).run();
                setPanel("none");
              }}
              className="size-6 rounded-full border border-current/20"
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().unsetHighlight().run();
              setPanel("none");
            }}
            className="ml-1 rounded px-2 py-1 text-xs underline opacity-70 hover:opacity-100"
          >
            None
          </button>
        </div>
      )}

      {panel === "link" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
          className="absolute left-2 top-full z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-md border border-current/20 bg-background p-2 shadow-lg"
        >
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link"
            aria-label="Link address"
            className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Apply
          </button>
        </form>
      )}

      {panel === "mention" && people && (
        <div className="absolute left-2 top-full z-20 mt-1 w-48 rounded-md border border-current/20 bg-background p-1 shadow-lg">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .insertContent([
                    { type: "mention", attrs: { id: p.id, label: p.name } },
                    { type: "text", text: " " },
                  ])
                  .run();
                setPanel("none");
              }}
              className="block w-full truncate rounded px-3 py-2 text-left text-sm hover:bg-current/10"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function mentionIds(editor: Editor): string[] {
  const ids = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "mention" && node.attrs.id) {
      ids.add(String(node.attrs.id));
    }
  });
  return [...ids];
}

export default function RichEditor({
  value,
  placeholder,
  onChange,
  onBlur,
  onSubmit,
  people,
  minHeight = 96,
  editorRef,
  autoFocus,
}: {
  value: string;
  placeholder: string;
  onChange?: (html: string) => void;
  onBlur?: (html: string) => void;
  onSubmit?: () => void;
  people?: Profile[];
  minHeight?: number;
  editorRef?: React.MutableRefObject<Editor | null>;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: value,
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "rich-content focus:outline-none",
        "aria-label": placeholder,
        style: `min-height:${minHeight}px`,
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmit) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.isEmpty ? "" : editor.getHTML());
    },
    onBlur: ({ editor }) => {
      onBlur?.(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

  if (!editor) {
    return (
      <div
        className="rounded-md border border-current/20"
        style={{ minHeight: minHeight + 40 }}
      />
    );
  }

  return (
    <div className="rounded-md border border-current/20 focus-within:border-current/50">
      <Toolbar editor={editor} people={people} />
      <div className="px-3 py-2 text-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function RichContent({ html }: { html: string }) {
  const editor = useEditor({
    extensions: extensions(""),
    content: html,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "rich-content" } },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== html) {
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [editor, html]);

  if (!editor) return null;

  return (
    <div
      className="text-sm"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (a?.getAttribute("href")) {
          e.preventDefault();
          window.open(a.getAttribute("href") as string, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
