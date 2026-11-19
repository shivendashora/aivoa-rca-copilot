import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import useAPICaller from '../common/hooks/useCallApi'
import CommonButton from '../common/common-button'
import { logout, meRequest, type MeResponse } from '../../api/auth'

/** Logged-in user's name and role, with a Logout button. */
export default function UserMenu() {
  const navigate = useNavigate()
  const { data, callApi } = useAPICaller<MeResponse>()

  useEffect(() => {
    callApi(meRequest())
  }, [callApi])

  const onLogout = async () => {
    try {
      await logout()
    } finally {
      navigate('/', { replace: true })
    }
  }

  const user = data?.data

  return (
    <div className="flex items-center gap-3">
      {user && (
        <div className="text-right leading-tight">
          <div className="text-xs font-medium text-ink">{user.username}</div>
          <div className="text-[10.5px] text-muted capitalize">{user.role}</div>
        </div>
      )}
      <CommonButton variant="icon" onClick={onLogout} className="flex items-center gap-1.5 text-xs">
        <LogOut size={14} />
        Logout
      </CommonButton>
    </div>
  )
}
