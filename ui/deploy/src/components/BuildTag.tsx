export function BuildTag() {
  const repo = import.meta.env.VITE_GITHUB_REPO as string | undefined
  const { short, sha, time } = __BUILD_INFO__
  const label = `Build ${short} @ ${new Date(time).toLocaleString()}`
  const href = repo && sha ? `https://github.com/${repo}/commit/${sha}` : undefined
  if (href) {
    return (
      <a className="pill muted" href={href} target="_blank" rel="noreferrer" title={sha}>{label}</a>
    )
  }
  return <span className="pill muted" title={sha}>{label}</span>
}

