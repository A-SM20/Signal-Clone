"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/controls";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { sendMessage } from "@/lib/messaging";
import { MAX_POLL_OPTIONS, pollDraftError } from "@/lib/polls";

const input =
  "w-full rounded-lg bg-surface-2 px-3 py-2 text-[14px] text-fg outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-primary";

export function CreatePollModal({ conversationId, onClose }: { conversationId: number; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [touched, setTouched] = useState(false);
  const error = pollDraftError(question, options);

  const send = () => {
    setTouched(true);
    if (error) return;
    sendMessage({
      conversation_id: conversationId,
      kind: "poll",
      poll: { question: question.trim(), options: options.map((o) => o.trim()).filter(Boolean), allow_multiple: multiple },
    });
    onClose();
  };

  return (
    <Modal
      title="New poll"
      onClose={onClose}
      width={420}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={send} disabled={touched && !!error}>
            Send
          </ModalButton>
        </>
      }
    >
      <label className="mb-1 block text-[13px] font-semibold text-fg-2" htmlFor="poll-question">
        Question
      </label>
      <input
        id="poll-question"
        className={input}
        maxLength={200}
        placeholder="Ask a question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <p className="mt-4 mb-1 text-[13px] font-semibold text-fg-2">Options</p>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Option ${i + 1}`}
              className={input}
              maxLength={100}
              placeholder={`Option ${i + 1}`}
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {options.length > 2 && (
              <button
                aria-label={`Remove option ${i + 1}`}
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="rounded-full p-1.5 text-fg-2 hover:bg-hover"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < MAX_POLL_OPTIONS && (
        <button
          onClick={() => setOptions([...options, ""])}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-1 py-1 text-[14px] font-semibold text-primary hover:underline"
        >
          <Plus size={16} /> Add option
        </button>
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[14px]">Allow multiple votes</span>
        <Switch label="Allow multiple votes" checked={multiple} onChange={setMultiple} />
      </div>
      {touched && error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
    </Modal>
  );
}
