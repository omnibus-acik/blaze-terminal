# Blaze OSC 133 + 7331 shell integration for bash.
# Uses PROMPT_COMMAND for precmd and the DEBUG trap for preexec.

if [[ -n "${BASH_VERSION:-}" ]]; then
    __blaze_emit_cwd() {
        local cwd_b64
        cwd_b64=$(printf '%s' "$PWD" | base64 | tr -d '\n')
        printf '\e]7331;cwd;%s\a' "$cwd_b64"
    }

    __blaze_precmd() {
        local exit=$?
        printf '\e]133;D;%s\a' "$exit"
        printf '\e]133;A\a'
        __blaze_emit_cwd
    }

    __blaze_preexec() {
        # The DEBUG trap fires for every simple command; only emit on the
        # first one after each prompt to avoid spamming inside compound
        # commands or PROMPT_COMMAND itself.
        if [[ -n "${BASH_COMMAND:-}" ]] && [[ -z "${__BLAZE_IN_CMD:-}" ]]; then
            __BLAZE_IN_CMD=1
            local cmd_b64
            cmd_b64=$(printf '%s' "$BASH_COMMAND" | base64 | tr -d '\n')
            printf '\e]7331;cmd;%s\a' "$cmd_b64"
            printf '\e]133;C\a'
        fi
    }

    PROMPT_COMMAND="__blaze_precmd; unset __BLAZE_IN_CMD${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
    trap '__blaze_preexec' DEBUG
fi
