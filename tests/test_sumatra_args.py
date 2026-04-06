from omg.print.win_dispatcher import Win32PrintDispatcher
import subprocess
from unittest.mock import patch

def test_sumatra_args():
    dispatcher = Win32PrintDispatcher()
    
    class DummyLabel:
        width_mm = 60.0
        height_mm = 30.0
        
    with patch("subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        try:
            dispatcher._try_sumatra("C:\\fake\\path.pdf", "Mock Printer", 4, label_config=DummyLabel())
        except Exception:
            pass
            
        args = mock_run.call_args[0][0]
        print("ARGS PASSED TO SUBPROCESS:")
        print(args)

if __name__ == "__main__":
    test_sumatra_args()
