import { describe, expect, it } from "vitest";
import { derivePreviewFromScripts } from "./spriteTextPreview";

function xml(body: string): string {
  return `<xml xmlns="https://developers.google.com/blockly/xml">${body}</xml>`;
}

describe("derivePreviewFromScripts", () => {
  it("returns empty patch for empty / malformed input", () => {
    expect(derivePreviewFromScripts("")).toEqual({});
    // jsdom's DOMParser returns a `<parsererror>` element for bad XML,
    // and our helper bails out cleanly.
    expect(derivePreviewFromScripts("<not valid xml >")).toEqual({});
  });

  it("clears all overlay state when no set_text_* block exists", () => {
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_event_when_flag_clicked"><next>
           <block type="scratch_motion_move_steps"><field name="STEPS">10</field></block>
         </next></block>`
      )
    );
    expect(patch).toEqual({
      text_value: undefined,
      font_family: undefined,
      text_size: undefined,
    });
  });

  it("reads a literal text from set_text_to", () => {
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_event_when_flag_clicked"><next>
           <block type="scratch_looks_set_text_to">
             <value name="TEXT">
               <shadow type="text"><field name="TEXT">Hello</field></shadow>
             </value>
           </block>
         </next></block>`
      )
    );
    expect(patch.text_value).toBe("Hello");
    // font / size aren't mentioned by this block, so they shouldn't be
    // in the patch (i.e. the runtime keeps owning them).
    expect(patch.font_family).toBeUndefined();
    expect(patch.text_size).toBeUndefined();
  });

  it("reads literal text + font from set_text_with_font", () => {
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_with_font">
           <value name="TEXT">
             <shadow type="text"><field name="TEXT">Header</field></shadow>
           </value>
           <value name="FONT">
             <shadow type="text"><field name="TEXT">Georgia</field></shadow>
           </value>
         </block>`
      )
    );
    expect(patch).toEqual({ text_value: "Header", font_family: "Georgia" });
  });

  it("reads literal numeric size from set_text_size_to and clamps", () => {
    const a = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_size_to">
           <value name="SIZE">
             <shadow type="math_number"><field name="NUM">24</field></shadow>
           </value>
         </block>`
      )
    );
    expect(a.text_size).toBe(24);

    // Below 8 clamps up; above 200 clamps down.
    const tooSmall = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_size_to">
           <value name="SIZE">
             <shadow type="math_number"><field name="NUM">3</field></shadow>
           </value>
         </block>`
      )
    );
    expect(tooSmall.text_size).toBe(8);

    const tooBig = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_size_to">
           <value name="SIZE">
             <shadow type="math_number"><field name="NUM">9999</field></shadow>
           </value>
         </block>`
      )
    );
    expect(tooBig.text_size).toBe(200);

    // Zero clears.
    const zero = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_size_to">
           <value name="SIZE">
             <shadow type="math_number"><field name="NUM">0</field></shadow>
           </value>
         </block>`
      )
    );
    expect(zero.text_size).toBeUndefined();
  });

  it("skips reporter inputs (variables, list lookups, op_join…)", () => {
    // Variable getter — non-literal, must NOT show up in the patch.
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_with_font">
           <value name="TEXT">
             <block type="scratch_data_variables_get">
               <field name="VARIABLE">message</field>
             </block>
           </value>
           <value name="FONT">
             <shadow type="text"><field name="TEXT">Helvetica</field></shadow>
           </value>
         </block>`
      )
    );
    // FONT is a literal so it shows up; TEXT is a reporter so it does not.
    expect(patch.font_family).toBe("Helvetica");
    expect(patch.text_value).toBeUndefined();
  });

  it("walks blocks inside statement bodies (e.g. forever)", () => {
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_event_when_flag_clicked"><next>
           <block type="scratch_control_forever">
             <statement name="DO">
               <block type="scratch_looks_set_text_with_font">
                 <value name="TEXT">
                   <shadow type="text"><field name="TEXT">Looped</field></shadow>
                 </value>
                 <value name="FONT">
                   <shadow type="text"><field name="TEXT">Courier New</field></shadow>
                 </value>
               </block>
             </statement>
           </block>
         </next></block>`
      )
    );
    expect(patch).toEqual({ text_value: "Looped", font_family: "Courier New" });
  });

  it("later literal wins over an earlier literal", () => {
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_to">
           <value name="TEXT">
             <shadow type="text"><field name="TEXT">First</field></shadow>
           </value>
           <next>
             <block type="scratch_looks_set_text_to">
               <value name="TEXT">
                 <shadow type="text"><field name="TEXT">Second</field></shadow>
               </value>
             </block>
           </next>
         </block>`
      )
    );
    expect(patch.text_value).toBe("Second");
  });

  it("preserves the runtime-owned field when input is a reporter (no clear)", () => {
    // Block exists with reporter input — the patch must NOT touch
    // text_value so the runtime's last value survives. Returned patch
    // has font_family because that input IS literal (empty string =
    // explicit clear, mirrors the runtime).
    const patch = derivePreviewFromScripts(
      xml(
        `<block type="scratch_looks_set_text_with_font">
           <value name="TEXT">
             <block type="scratch_data_variables_get">
               <field name="VARIABLE">msg</field>
             </block>
           </value>
           <value name="FONT">
             <shadow type="text"><field name="TEXT"></field></shadow>
           </value>
         </block>`
      )
    );
    expect(patch.text_value).toBeUndefined(); // runtime keeps it
    expect(patch.font_family).toBeUndefined(); // empty literal → clear
  });
});
