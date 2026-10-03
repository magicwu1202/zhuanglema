import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/** 带一键复制按钮的代码块 */
function CodeBlock({ children, ...props }) {
  const [copied, setCopied] = useState(false);

  const extractText = (node) => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (node?.props?.children) return extractText(node.props.children);
    return "";
  };

  const lang = (() => {
    const cls = children?.props?.className || "";
    const m = cls.match(/language-(\w+)/);
    return m ? m[1] : "code";
  })();

  const copy = async () => {
    await navigator.clipboard.writeText(extractText(children).trimEnd());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="code-card">
      <div className="flex items-center justify-between px-4 py-2 bg-ink text-cream border-b-[3px] border-ink"
        style={{ background: "#211a14", color: "#fff7e8" }}>
        <span className="text-xs font-bold tracking-wider uppercase opacity-80">{lang}</span>
        <button
          onClick={copy}
          className="text-xs font-bold px-3 py-1 rounded-lg border-2 transition-colors"
          style={{
            borderColor: copied ? "#2ec4a0" : "#fff7e8",
            color: copied ? "#2ec4a0" : "#fff7e8",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {copied ? "✓ 已复制" : "📋 复制"}
        </button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}

function ExternalLink({ href, children }) {
  const open = (e) => {
    e.preventDefault();
    if (window.zhuangAPI) window.zhuangAPI.openExternal(href);
    else window.open(href, "_blank");
  };
  return (
    <a href={href} onClick={open}>
      {children}
    </a>
  );
}

export default function Markdown({ content }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: false }]]}
        components={{ pre: CodeBlock, a: ExternalLink }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
