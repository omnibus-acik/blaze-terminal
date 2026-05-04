# Blaze OSC 133 + 7331 shell integration for fish.

function __blaze_preexec --on-event fish_preexec
    set -l cmd_b64 (printf '%s' "$argv" | base64 | tr -d '\n')
    printf '\e]7331;cmd;%s\a' $cmd_b64
    printf '\e]133;C\a'
end

function __blaze_precmd --on-event fish_prompt
    set -l exit $status
    printf '\e]133;D;%s\a' $exit
    printf '\e]133;A\a'
end
