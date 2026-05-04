//! Strip ANSI escape sequences from a byte slice so parsers see plain text.
//!
//! Handles CSI (`ESC [ ... final-byte`) and OSC (`ESC ] ... BEL` / `ESC \\`).
//! Unknown escape sequences are dropped along with the introducer.

pub fn strip(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        let b = input[i];
        if b == 0x1b && i + 1 < input.len() {
            let next = input[i + 1];
            match next {
                b'[' => {
                    i += 2;
                    while i < input.len() {
                        let c = input[i];
                        i += 1;
                        if (0x40..=0x7e).contains(&c) {
                            break;
                        }
                    }
                    continue;
                }
                b']' => {
                    i += 2;
                    while i < input.len() {
                        let c = input[i];
                        if c == 0x07 {
                            i += 1;
                            break;
                        }
                        if c == 0x1b && i + 1 < input.len() && input[i + 1] == b'\\' {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                    continue;
                }
                // ESC sequences with one intermediate byte (e.g. ESC ( B for charset)
                b'(' | b')' | b'*' | b'+' => {
                    i += 3.min(input.len() - i);
                    continue;
                }
                _ => {
                    // Unknown 2-byte escape — drop both.
                    i += 2;
                    continue;
                }
            }
        }
        out.push(b);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_csi_color() {
        assert_eq!(strip(b"\x1b[31mred\x1b[0m"), b"red");
    }

    #[test]
    fn strips_osc() {
        assert_eq!(strip(b"\x1b]0;title\x07hello"), b"hello");
        assert_eq!(strip(b"hello\x1b]133;A\x1b\\world"), b"helloworld");
    }

    #[test]
    fn passes_plain_text_through() {
        assert_eq!(strip(b"plain text"), b"plain text");
    }

    #[test]
    fn handles_complex_csi() {
        assert_eq!(strip(b"\x1b[1;31;40mxyz\x1b[m"), b"xyz");
    }
}
