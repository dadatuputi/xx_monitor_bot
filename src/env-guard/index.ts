export function guard(vars: string[], guarding?: string) {
    const environment = Object.keys(process.env)

    const missing = vars.filter( v => !environment.includes(v) );
    if (missing.length)
        throw new Error(`Missing${guarding && ` ${guarding}`} env vars: ${missing.join(', ')}`) 
}