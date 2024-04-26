export function vars_in_env(vars: string[], guarding: string, throw_error: boolean = true, check_empty: boolean = true): boolean {
    const environment = Object.keys(process.env)

    let missing = vars.filter( v => !environment.includes(v) );

    if (check_empty) {
        let empty = vars.filter( v => environment.includes(v)).filter( v => process.env[v] === '')
        missing = [...missing, ...empty]
    }

    if (missing.length) {
        const log_message = `Missing${guarding && ` ${guarding}`} env vars: ${missing.join(', ')}`
        if (throw_error) throw new Error(log_message)
        console.log(log_message)
    }

    return !missing.length
}