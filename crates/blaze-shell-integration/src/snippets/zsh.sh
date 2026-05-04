# Blaze OSC 133 + 7331 shell integration for zsh.
# Emits FinalTerm-style block markers, captures the exact command, and
# reports the working directory on each prompt so Blaze can route drag-drop
# transfers and other cwd-aware features. Safe under any prompt theme.

if [[ -n "${ZSH_VERSION:-}" ]]; then
    autoload -Uz add-zsh-hook 2>/dev/null

    __blaze_emit_cwd() {
        local cwd_b64
        cwd_b64=$(printf '%s' "$PWD" | base64 | tr -d '\n')
        printf '\e]7331;cwd;%s\a' "$cwd_b64"
    }

    __blaze_precmd() {
        local exit=$?
        printf '\e]133;D;%s\a' "$exit"   # end previous command's output
        printf '\e]133;A\a'              # mark prompt start
        __blaze_emit_cwd
    }

    __blaze_preexec() {
        # $1 is the full command line as the user typed it.
        local cmd_b64
        cmd_b64=$(printf '%s' "$1" | base64 | tr -d '\n')
        printf '\e]7331;cmd;%s\a' "$cmd_b64"   # capture the command
        printf '\e]133;C\a'                    # mark output start
    }

    add-zsh-hook precmd  __blaze_precmd
    add-zsh-hook preexec __blaze_preexec
fi
